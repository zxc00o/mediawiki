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

namespace MediaWiki\Block;

use MediaWiki\Permissions\Authority;
use MediaWiki\User\UserIdentity;

/**
 * @since 1.36
 */
interface UnblockUserFactory {
	/**
	 * @param BlockTarget|UserIdentity|string $target
	 * @param Authority $performer
	 * @param string $reason
	 * @param string[] $tags
	 *
	 * @return UnblockUser
	 */
	public function newUnblockUser(
		$target,
		Authority $performer,
		string $reason,
		array $tags = []
	): UnblockUser;

	/**
	 * Creates UnblockUser to remove a specific block
	 *
	 * @since 1.44
	 *
	 * @param DatabaseBlock $block
	 * @param Authority $performer
	 * @param string $reason
	 * @param array $tags
	 *
	 * @return UnblockUser
	 */
	public function newRemoveBlock(
		DatabaseBlock $block,
		Authority $performer,
		string $reason,
		array $tags = []
	): UnblockUser;
}
