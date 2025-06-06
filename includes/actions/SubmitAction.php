<?php
/**
 * Wrapper for EditAction; sets the session cookie.
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA
 *
 * @file
 * @ingroup Actions
 */

namespace MediaWiki\Actions;

/**
 * This is the same as EditAction; except that it sets the session cookie.
 *
 * @ingroup Actions
 */
class SubmitAction extends EditAction {

	/** @inheritDoc */
	public function getName() {
		return 'submit';
	}

	/** @inheritDoc */
	public function show() {
		// Send a cookie so anons get talk message notifications
		\MediaWiki\Session\SessionManager::getGlobalSession()->persist();

		parent::show();
	}
}

/** @deprecated class alias since 1.44 */
class_alias( SubmitAction::class, 'SubmitAction' );
