<?php

use MediaWiki\Html\FormOptions;
use MediaWiki\RecentChanges\ChangesListFilter;

class MockChangesListFilter extends ChangesListFilter {
	/** @inheritDoc */
	public function displaysOnUnstructuredUi() {
		throw new LogicException(
			'Not implemented: If the test relies on this, put it one of the ' .
			'subclasses\' tests (e.g. ChangesListBooleanFilterTest) ' .
			'instead of testing the abstract class'
		);
	}

	/** @inheritDoc */
	public function isSelected( FormOptions $opts ) {
		return false;
	}
}
