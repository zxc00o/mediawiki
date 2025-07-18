<?php

use MediaWiki\Html\FormOptions;
use MediaWiki\RecentChanges\ChangesListFilterGroup;
use MediaWiki\SpecialPage\ChangesListSpecialPage;
use Wikimedia\Rdbms\IReadableDatabase;

class MockChangesListFilterGroup extends ChangesListFilterGroup {
	/** @inheritDoc */
	public function createFilter( array $filterDefinition ) {
		return new MockChangesListFilter( $filterDefinition );
	}

	/** @inheritDoc */
	public function registerFilter( MockChangesListFilter $filter ) {
		$this->filters[$filter->getName()] = $filter;
	}

	/** @inheritDoc */
	public function modifyQuery( IReadableDatabase $dbr, ChangesListSpecialPage $specialPage,
		&$tables, &$fields, &$conds, &$query_options, &$join_conds, FormOptions $opts,
		$isStructuredFiltersEnabled ) {
	}

	/** @inheritDoc */
	public function addOptions( FormOptions $opts, $allowDefaults, $isStructuredFiltersEnabled ) {
	}
}
