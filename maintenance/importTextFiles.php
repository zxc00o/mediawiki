<?php
/**
 * Import pages from text files
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
 * http://www.gnu.org/copyleft/gpl.html
 *
 * @file
 * @ingroup Maintenance
 */

use MediaWiki\Content\ContentHandler;
use MediaWiki\Maintenance\Maintenance;
use MediaWiki\RecentChanges\RecentChange;
use MediaWiki\Revision\SlotRecord;
use MediaWiki\Title\Title;
use MediaWiki\User\User;

// @codeCoverageIgnoreStart
require_once __DIR__ . '/Maintenance.php';
// @codeCoverageIgnoreEnd

/**
 * Maintenance script which reads in text files
 * and imports their content to a page of the wiki.
 *
 * @ingroup Maintenance
 */
class ImportTextFiles extends Maintenance {
	public function __construct() {
		parent::__construct();
		$this->addDescription( 'Reads in text files and imports their content to pages of the wiki' );
		$this->addOption( 'user', 'Username to which edits should be attributed. ' .
			'Default: "Maintenance script"', false, true, 'u' );
		$this->addOption( 'summary', 'Specify edit summary for the edits', false, true, 's' );
		$this->addOption( 'use-timestamp', 'Use the modification date of the text file ' .
			'as the timestamp for the edit' );
		$this->addOption( 'overwrite', 'Overwrite existing pages. If --use-timestamp is passed, this ' .
			'will only overwrite pages if the file has been modified since the page was last modified.' );
		$this->addOption( 'prefix', 'A string to place in front of the file name', false, true, 'p' );
		$this->addOption( 'bot', 'Mark edits as bot edits in the recent changes list.' );
		$this->addOption( 'rc', 'Place revisions in RecentChanges.' );
		$this->addArg( 'files', 'Files to import' );
	}

	public function execute() {
		$userName = $this->getOption( 'user', false );
		$summary = $this->getOption( 'summary', 'Imported from text file' );
		$useTimestamp = $this->hasOption( 'use-timestamp' );
		$rc = $this->hasOption( 'rc' );
		$bot = $this->hasOption( 'bot' );
		$overwrite = $this->hasOption( 'overwrite' );
		$prefix = $this->getOption( 'prefix', '' );

		// Get all the arguments. A loop is required since Maintenance doesn't
		// support an arbitrary number of arguments.
		$files = [];
		$i = 0;
		// phpcs:ignore Generic.CodeAnalysis.AssignmentInCondition.FoundInWhileCondition
		while ( $arg = $this->getArg( $i++ ) ) {
			if ( file_exists( $arg ) ) {
				$files[$arg] = file_get_contents( $arg );
			} else {
				// use glob to support the Windows shell, which doesn't automatically
				// expand wildcards
				$found = false;
				foreach ( glob( $arg ) as $filename ) {
					$found = true;
					$files[$filename] = file_get_contents( $filename );
				}
				if ( !$found ) {
					$this->fatalError( "Fatal error: The file '$arg' does not exist!" );
				}
			}
		}

		$count = count( $files );
		$this->output( "Importing $count pages...\n" );

		if ( $userName === false ) {
			$user = User::newSystemUser( User::MAINTENANCE_SCRIPT_USER, [ 'steal' => true ] );
		} else {
			$user = User::newFromName( $userName );
		}

		if ( !$user ) {
			$this->fatalError( "Invalid username\n" );
		}
		if ( $user->isAnon() ) {
			$user->addToDatabase();
		}

		$exit = 0;

		$successCount = 0;
		$failCount = 0;
		$skipCount = 0;

		$revLookup = $this->getServiceContainer()->getRevisionLookup();
		foreach ( $files as $file => $text ) {
			$pageName = $prefix . pathinfo( $file, PATHINFO_FILENAME );
			$timestamp = $useTimestamp ? wfTimestamp( TS_UNIX, filemtime( $file ) ) : wfTimestampNow();

			$title = Title::newFromText( $pageName );
			// Have to check for # manually, since it gets interpreted as a fragment
			if ( !$title || $title->hasFragment() ) {
				$this->error( "Invalid title $pageName. Skipping.\n" );
				$skipCount++;
				continue;
			}

			$exists = $title->exists();
			$oldRevID = $title->getLatestRevID();
			$oldRevRecord = $oldRevID ? $revLookup->getRevisionById( $oldRevID ) : null;
			$actualTitle = $title->getPrefixedText();

			if ( $exists ) {
				$touched = wfTimestamp( TS_UNIX, $title->getTouched() );
				if ( !$overwrite ) {
					$this->output( "Title $actualTitle already exists. Skipping.\n" );
					$skipCount++;
					continue;
				} elseif ( $useTimestamp && intval( $touched ) >= intval( $timestamp ) ) {
					$this->output( "File for title $actualTitle has not been modified since the " .
						"destination page was touched. Skipping.\n" );
					$skipCount++;
					continue;
				}
			}

			$content = ContentHandler::makeContent( rtrim( $text ), $title );
			$rev = new WikiRevision();
			$rev->setContent( SlotRecord::MAIN, $content );
			$rev->setTitle( $title );
			$rev->setUserObj( $user );
			$rev->setComment( $summary );
			$rev->setTimestamp( $timestamp );

			if ( $exists &&
				$overwrite &&
				$rev->getContent()->equals( $oldRevRecord->getContent( SlotRecord::MAIN ) )
			) {
				$this->output( "File for title $actualTitle contains no changes from the current " .
					"revision. Skipping.\n" );
				$skipCount++;
				continue;
			}

			$status = $rev->importOldRevision();
			$newId = $title->getLatestRevID();

			if ( $status ) {
				$action = $exists ? 'updated' : 'created';
				$this->output( "Successfully $action $actualTitle\n" );
				$successCount++;
			} else {
				$action = $exists ? 'update' : 'create';
				$this->output( "Failed to $action $actualTitle\n" );
				$failCount++;
				$exit = 1;
			}

			// Create the RecentChanges entry if necessary
			if ( $rc && $status ) {
				if ( $exists ) {
					if ( is_object( $oldRevRecord ) ) {
						RecentChange::notifyEdit(
							$timestamp,
							$title,
							$rev->getMinor(),
							$user,
							$summary,
							$oldRevID,
							$oldRevRecord->getTimestamp(),
							$bot,
							'',
							$oldRevRecord->getSize(),
							$rev->getSize(),
							$newId,
							// the pages don't need to be patrolled
							1
						);
					}
				} else {
					RecentChange::notifyNew(
						$timestamp,
						$title,
						$rev->getMinor(),
						$user,
						$summary,
						$bot,
						'',
						$rev->getSize(),
						$newId,
						1
					);
				}
			}
		}

		$this->output( "Done! $successCount succeeded, $skipCount skipped.\n" );
		if ( $exit ) {
			$this->fatalError( "Import failed with $failCount failed pages.\n", $exit );
		}
	}
}

// @codeCoverageIgnoreStart
$maintClass = ImportTextFiles::class;
require_once RUN_MAINTENANCE_IF_MAIN;
// @codeCoverageIgnoreEnd
