<?php
/**
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
 */

use MediaWiki\JobQueue\Job;
use MediaWiki\Title\Title;
use MediaWiki\User\User;

/**
 * Send an email notification.
 *
 * @ingroup JobQueue
 * @ingroup Mail
 */
class EnotifNotifyJob extends Job {
	public function __construct( Title $title, array $params ) {
		parent::__construct( 'enotifNotify', $title, $params );
	}

	public function run() {
		$enotif = new EmailNotification();
		// Get the user from ID (rename safe). Anons are 0, so defer to name.
		if ( isset( $this->params['editorID'] ) && $this->params['editorID'] ) {
			$editor = User::newFromId( $this->params['editorID'] );
		// B/C, only the name might be given.
		} else {
			# @todo FIXME: newFromName could return false on a badly configured wiki.
			$editor = User::newFromName( $this->params['editor'], false );
		}
		// @todo make use of $this->params['rc_id'], there is no need to store all params
		// we can pass the RecentChange to actuallyNotify by calling
		// RecentChange::newFromId( $this->params['rc_id'] )
		$enotif->actuallyNotifyOnPageChange(
			$editor,
			$this->title,
			$this->params['timestamp'],
			$this->params['summary'],
			$this->params['minorEdit'],
			$this->params['oldid'],
			$this->params['watchers'],
			$this->params['pageStatus']
		);

		return true;
	}
}
