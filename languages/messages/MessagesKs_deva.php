<?php
/** Kashmiri (Devanagari script) (कॉशुर)
 *
 * Deprecated, preserved for backwards compatibility
 * and for possible future reinstatement if
 * the usage of this script becomes active.
 * Since T314476, the primary script for
 * Kasmiri is Perso-Arabic.
 *
 * @file
 * @ingroup Languages
 *
 * @author Rk_kaul (on ks.wikipedia.org)
 * @author VibhasKS
 */

$namespaceNames = [
	NS_MEDIA            => 'मीडिया',
	NS_SPECIAL          => 'खास',
	NS_TALK             => 'बहज़',
	NS_USER             => 'रुक्न',
	NS_USER_TALK        => 'रुक्न_बहज़',
	NS_PROJECT_TALK     => '$1_बहज़',
	NS_FILE             => 'फ़ाइल',
	NS_FILE_TALK        => 'फ़ाइल_बहज़',
	NS_MEDIAWIKI        => 'मीडियाविकि',
	NS_MEDIAWIKI_TALK   => 'मीडियाविकि_बहज़',
	NS_TEMPLATE         => 'नमॆना',
	NS_TEMPLATE_TALK    => 'नमॆना_बहज़',
	NS_HELP             => 'म॒दत',
	NS_HELP_TALK        => 'म॒दत_बहज़',
	NS_CATEGORY         => 'ज़ॉज़',
	NS_CATEGORY_TALK    => 'ज़ॉज़_बहज़',
];

$digitTransformTable = [
	'0' => '०', # U+0966
	'1' => '१', # U+0967
	'2' => '२', # U+0968
	'3' => '३', # U+0969
	'4' => '४', # U+096A
	'5' => '५', # U+096B
	'6' => '६', # U+096C
	'7' => '७', # U+096D
	'8' => '८', # U+096E
	'9' => '९', # U+096F
];

$numberingSystem = 'deva';
