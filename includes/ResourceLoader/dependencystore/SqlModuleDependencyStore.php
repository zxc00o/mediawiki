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

namespace Wikimedia\DependencyStore;

use InvalidArgumentException;
use Wikimedia\Rdbms\IDatabase;
use Wikimedia\Rdbms\ILoadBalancer;
use Wikimedia\Rdbms\IReadableDatabase;

/**
 * Track per-module file dependencies in the core module_deps table
 *
 * Wiki farms that are too big for maintenance/update.php, can clean up
 * unneeded data for modules that no longer exist after a MW upgrade,
 * by running maintenance/cleanupRemovedModules.php.
 *
 * To force a rebuild and incurr a small penalty in browser cache churn,
 * run maintenance/purgeModuleDeps.php instead.
 *
 * @internal For use by ResourceLoader\Module only
 * @since 1.35
 */
class SqlModuleDependencyStore extends DependencyStore {
	/** @var ILoadBalancer */
	private $lb;

	/**
	 * @param ILoadBalancer $lb Storage backend
	 */
	public function __construct( ILoadBalancer $lb ) {
		$this->lb = $lb;
	}

	public function retrieveMulti( $type, array $entities ) {
		$dbr = $this->getReplicaDb();

		$depsBlobByEntity = $this->fetchDependencyBlobs( $entities, $dbr );

		$storedPathsByEntity = [];
		foreach ( $depsBlobByEntity as $entity => $depsBlob ) {
			$storedPathsByEntity[$entity] = json_decode( $depsBlob, true );
		}

		$results = [];
		foreach ( $entities as $entity ) {
			$paths = $storedPathsByEntity[$entity] ?? [];
			$results[$entity] = $this->newEntityDependencies( $paths, null );
		}

		return $results;
	}

	public function storeMulti( $type, array $dataByEntity, $ttl ) {
		// Avoid opening a primary DB connection when it's not needed.
		// ResourceLoader::saveModuleDependenciesInternal calls this method unconditionally
		// with empty values most of the time.
		if ( !$dataByEntity ) {
			return;
		}

		$dbw = $this->getPrimaryDb();
		$depsBlobByEntity = $this->fetchDependencyBlobs( array_keys( $dataByEntity ), $dbw );

		$rows = [];
		foreach ( $dataByEntity as $entity => $data ) {
			[ $module, $variant ] = $this->getEntityNameComponents( $entity );
			if ( !is_array( $data[self::KEY_PATHS] ) ) {
				throw new InvalidArgumentException( "Invalid entry for '$entity'" );
			}

			// Normalize the list by removing duplicates and sortings
			$paths = array_values( array_unique( $data[self::KEY_PATHS] ) );
			sort( $paths, SORT_STRING );
			$blob = json_encode( $paths, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );

			$existingBlob = $depsBlobByEntity[$entity] ?? null;
			if ( $blob !== $existingBlob ) {
				$rows[] = [
					'md_module' => $module,
					'md_skin' => $variant,
					'md_deps' => $blob
				];
			}
		}

		// @TODO: use a single query with VALUES()/aliases support in DB wrapper
		// See https://dev.mysql.com/doc/refman/8.0/en/insert-on-duplicate.html
		foreach ( $rows as $row ) {
			$dbw->newInsertQueryBuilder()
				->insertInto( 'module_deps' )
				->row( $row )
				->onDuplicateKeyUpdate()
				->uniqueIndexFields( [ 'md_module', 'md_skin' ] )
				->set( [ 'md_deps' => $row['md_deps'] ] )
				->caller( __METHOD__ )->execute();
		}
	}

	public function remove( $type, $entities ) {
		// Avoid opening a primary DB connection when it's not needed.
		// ResourceLoader::saveModuleDependenciesInternal calls this method unconditionally
		// with empty values most of the time.
		if ( !$entities ) {
			return;
		}

		$dbw = $this->getPrimaryDb();
		$disjunctionConds = [];
		foreach ( (array)$entities as $entity ) {
			[ $module, $variant ] = $this->getEntityNameComponents( $entity );
			$disjunctionConds[] = $dbw
				->expr( 'md_skin', '=', $variant )
				->and( 'md_module', '=', $module );
		}

		if ( $disjunctionConds ) {
			$dbw->newDeleteQueryBuilder()
				->deleteFrom( 'module_deps' )
				->where( $dbw->orExpr( $disjunctionConds ) )
				->caller( __METHOD__ )->execute();
		}
	}

	/**
	 * @param string[] $entities
	 * @param IReadableDatabase $db
	 * @return string[]
	 */
	private function fetchDependencyBlobs( array $entities, IReadableDatabase $db ) {
		$modulesByVariant = [];
		foreach ( $entities as $entity ) {
			[ $module, $variant ] = $this->getEntityNameComponents( $entity );
			$modulesByVariant[$variant][] = $module;
		}

		$disjunctionConds = [];
		foreach ( $modulesByVariant as $variant => $modules ) {
			$disjunctionConds[] = $db
				->expr( 'md_skin', '=', $variant )
				->and( 'md_module', '=', $modules );
		}

		$depsBlobByEntity = [];

		if ( $disjunctionConds ) {
			$res = $db->newSelectQueryBuilder()
				->select( [ 'md_module', 'md_skin', 'md_deps' ] )
				->from( 'module_deps' )
				->where( $db->orExpr( $disjunctionConds ) )
				->caller( __METHOD__ )->fetchResultSet();

			foreach ( $res as $row ) {
				$entity = "{$row->md_module}|{$row->md_skin}";
				$depsBlobByEntity[$entity] = $row->md_deps;
			}
		}

		return $depsBlobByEntity;
	}

	/**
	 * @return IReadableDatabase
	 */
	private function getReplicaDb() {
		return $this->lb
			->getConnection( DB_REPLICA, [], false, ( $this->lb )::CONN_TRX_AUTOCOMMIT );
	}

	/**
	 * @return IDatabase
	 */
	private function getPrimaryDb() {
		return $this->lb
			->getConnection( DB_PRIMARY, [], false, ( $this->lb )::CONN_TRX_AUTOCOMMIT );
	}

	/**
	 * @param string $entity
	 * @return string[]
	 */
	private function getEntityNameComponents( $entity ) {
		$parts = explode( '|', $entity, 2 );
		if ( count( $parts ) !== 2 ) {
			throw new InvalidArgumentException( "Invalid module entity '$entity'" );
		}

		return $parts;
	}
}
