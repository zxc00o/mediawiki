<?php

namespace MediaWiki\Hook;

use MediaWiki\FileRepo\File\File;
use MediaWiki\Parser\Parser;

/**
 * This is a hook handler interface, see docs/Hooks.md.
 * Use the hook name "ParserModifyImageHTML" to register handlers implementing this interface.
 *
 * @stable to implement
 * @ingroup Hooks
 */
interface ParserModifyImageHTMLHook {
	/**
	 * This hook is called for each image added to parser output, with its
	 * associated HTML as returned from Linker::makeImageLink().
	 *
	 * @param Parser $parser
	 * @param File $file
	 * @param array $params An associative array of options that were used to generate the HTML.
	 *   Like the one sent to onParserMakeImageParams.  The 'handler' element contains handler
	 *   options. The 'frame' element contains frame options. In the image gallery case, "frame"
	 *   will be missing.
	 * @param string &$html The HTML of the image or image wrapper
	 */
	public function onParserModifyImageHTML( Parser $parser, File $file,
		array $params, string &$html ): void;
}

/** @deprecated class alias since 1.41 */
class_alias( ParserModifyImageHTMLHook::class, 'MediaWiki\Hook\ParserModifyImageHTML' );
