( function () {
	QUnit.module( 'mw.loader', QUnit.newMwEnvironment( {
		beforeEach: function ( assert ) {
			// Expose for load.mock.php
			mw.loader.testFail = function ( reason ) {
				assert.true( false, reason );
			};

			this.resetStore = false;
			this.stubStore = function () {
				this.resetStore = true;
				mw.loader.store.items = {};
				// Like mw.loader.store.init()
				mw.loader.store.enabled = false;
			};

			this.useStubClock = function () {
				this.clock = this.sandbox.useFakeTimers();
				this.tick = function ( forward ) {
					return this.clock.tick( forward || 1 );
				};
				this.sandbox.stub( mw, 'requestIdleCallback', mw.requestIdleCallbackInternal );
			};
		},
		afterEach: function () {
			mw.loader.maxQueryLength = 2000;
			if ( this.resetStore ) {
				mw.loader.store.enabled = null;
				mw.loader.store.items = {};
				localStorage.removeItem( mw.loader.store.key );
			}
			// Remove any remaining temporary static state
			// exposed for mocking and stubbing.
			delete mw.loader.testCallback;
			delete mw.loader.testFail;
			delete mw.getScriptExampleScriptLoaded;
		}
	} ) );

	// Full URL to $wgScriptPath with trailing slash.
	// * $wgScriptPath is usually path-only, so we expand relative to $wgServer
	//   to ensure consistent and portable results (even when tested through Karma).
	// * $wgScriptPath is an empty string when installed at the document root
	//   (as the case when using `composer serve`), we normalize to trailing slash.
	const SCRIPT_PATH_URL = new URL(
		mw.config.get( 'wgScriptPath' ) + '/',
		mw.config.get( 'wgServer' )
	).toString();

	mw.loader.addSource( {
		testloader: SCRIPT_PATH_URL + 'tests/qunit/data/load.mock.php'
	} );

	/**
	 * The sync style load test, for @import. This is, in a way, also an open bug for
	 * ResourceLoader ("execute js after styles are loaded"), but browsers don't offer a
	 * way to get a callback from when a stylesheet is loaded (that is, including any
	 * `@import` rules inside). To work around this, we'll have a little time loop to check
	 * if the styles apply.
	 *
	 * Note: This test originally used new Image() and onerror to get a callback
	 * when the url is loaded, but that is fragile since it doesn't monitor the
	 * same request as the css @import, and Safari 4 has issues with
	 * onerror/onload not being fired at all in weird cases like this.
	 *
	 * @param {Object} assert QUnit test assertion context
	 * @param {jQuery} $element
	 * @param {string} prop
	 * @param {string} val
	 * @param {Function} fn
	 */
	function assertStyleAsync( assert, $element, prop, val, fn ) {
		let styleTestStart = null;
		const el = $element.get( 0 ),
			styleTestTimeout = ( QUnit.config.testTimeout || 5000 ) - 200;

		function isCssImportApplied() {
			// Trigger reflow, repaint, redraw, whatever (cross-browser)
			$element.css( 'height' );
			// eslint-disable-next-line no-unused-expressions
			el.innerHTML;
			// eslint-disable-next-line no-self-assign, mediawiki/class-doc
			el.className = el.className;
			// eslint-disable-next-line no-unused-expressions
			document.documentElement.clientHeight;

			return $element.css( prop ) === val;
		}

		function styleTestLoop() {
			const styleTestSince = Date.now() - styleTestStart;
			// If it is passing or if we timed out, run the real test and stop the loop
			if ( isCssImportApplied() || styleTestSince > styleTestTimeout ) {
				assert.strictEqual( $element.css( prop ), val,
					'style "' + prop + ': ' + val + '" from url is applied (after ' + styleTestSince + 'ms)'
				);

				if ( fn ) {
					fn();
				}

				return;
			}
			// Otherwise, keep polling
			setTimeout( styleTestLoop );
		}

		// Start the loop
		styleTestStart = Date.now();
		styleTestLoop();
	}

	function urlStyleTest( selector, prop, val ) {
		return SCRIPT_PATH_URL + 'tests/qunit/data/styleTest.css.php?' +
			$.param( {
				selector: selector,
				prop: prop,
				val: val
			} );
	}

	QUnit.test( '.using( .., Function callback ) Promise', ( assert ) => {
		let script = 0, callback = 0;
		mw.loader.testCallback = function () {
			script++;
		};
		mw.loader.implement( 'test.promise', [ SCRIPT_PATH_URL + 'tests/qunit/data/mwLoaderTestCallback.js' ] );

		return mw.loader.using( 'test.promise', () => {
			callback++;
		} ).then( () => {
			assert.strictEqual( script, 1, 'module script ran' );
			assert.strictEqual( callback, 1, 'using() callback ran' );
		} );
	} );

	QUnit.test( 'Prototype method as module name', ( assert ) => {
		let call = 0;
		mw.loader.testCallback = function () {
			call++;
		};
		mw.loader.implement( 'hasOwnProperty', [ SCRIPT_PATH_URL + 'tests/qunit/data/mwLoaderTestCallback.js' ], {}, {} );

		return mw.loader.using( 'hasOwnProperty', () => {
			assert.strictEqual( call, 1, 'module script ran' );
		} );
	} );

	// Covers mw.loader#sortDependencies (with native Set)
	QUnit.test( '.using() - Error: Circular dependency [Set]', ( assert ) => {
		const done = assert.async();

		mw.loader.register( [
			[ 'test.set.circleA', '0', [ 'test.set.circleB' ] ],
			[ 'test.set.circleB', '0', [ 'test.set.circleC' ] ],
			[ 'test.set.circleC', '0', [ 'test.set.circleA' ] ]
		] );
		mw.loader.using( 'test.set.circleC' ).then(
			() => {
				assert.true( false, 'Unexpected resolution, expected error.' );
			},
			( e ) => {
				assert.true( /Circular/.test( String( e ) ), 'Detect circular dependency' );
			}
		)
			.always( done );
	} );

	QUnit.test( '.load() - Error: Circular dependency', function ( assert ) {
		const capture = [];
		mw.loader.register( [
			[ 'test.load.circleA', '0', [ 'test.load.circleB' ] ],
			[ 'test.load.circleB', '0', [ 'test.load.circleC' ] ],
			[ 'test.load.circleC', '0', [ 'test.load.circleA' ] ]
		] );
		this.sandbox.stub( mw, 'trackError', ( data ) => {
			capture.push( {
				error: data.exception && data.exception.message,
				source: data.source
			} );
		} );
		this.suppressWarnings(); // Skipped unavailable module

		mw.loader.load( 'test.load.circleC' );
		assert.deepEqual(
			capture,
			[ {
				error: 'Circular reference detected: test.load.circleB -> test.load.circleC',
				source: 'resolve'
			} ],
			'Detect circular dependency'
		);
	} );

	QUnit.test( '.load() - Error: Circular dependency (direct)', function ( assert ) {
		const capture = [];
		mw.loader.register( [
			[ 'test.load.circleDirect', '0', [ 'test.load.circleDirect' ] ]
		] );
		this.sandbox.stub( mw, 'trackError', ( data ) => {
			capture.push( {
				error: data.exception && data.exception.message,
				source: data.source
			} );
		} );
		this.suppressWarnings(); // Skipped unavailable module

		mw.loader.load( 'test.load.circleDirect' );
		assert.deepEqual(
			capture,
			[ {
				error: 'Circular reference detected: test.load.circleDirect -> test.load.circleDirect',
				source: 'resolve'
			} ],
			'Detect a direct self-dependency'
		);
	} );

	QUnit.test( '.using() - Error: Unregistered', ( assert ) => {
		const done = assert.async();

		mw.loader.using( 'test.using.unreg' ).then(
			() => {
				assert.true( false, 'Unexpected resolution, expected error.' );
			},
			( e ) => {
				assert.true( /Unknown/.test( String( e ) ), 'Detect unknown dependency' );
			}
		).always( done );
	} );

	QUnit.test( '.load() - Error: Unregistered', function ( assert ) {
		const capture = [];
		this.sandbox.stub( mw.log, 'warn', ( str ) => {
			capture.push( str );
		} );

		mw.loader.load( 'test.load.unreg' );
		assert.deepEqual( capture, [ 'Skipped unavailable module test.load.unreg' ] );
	} );

	// Regression test for T36853
	QUnit.test( '.load() - Error: Missing dependency', function ( assert ) {
		const capture = [];
		this.sandbox.stub( mw, 'trackError', ( data ) => {
			capture.push( {
				error: data.exception && data.exception.message,
				source: data.source
			} );
		} );
		this.suppressWarnings(); // Skipped unavailable module

		mw.loader.register( [
			[ 'test.load.missingdep1', '0', [ 'test.load.missingdep2' ] ],
			[ 'test.load.missingdep', '0', [ 'test.load.missingdep1' ] ]
		] );
		mw.loader.load( 'test.load.missingdep' );
		assert.deepEqual(
			capture,
			[ {
				error: 'Unknown module: test.load.missingdep2',
				source: 'resolve'
			} ]
		);
	} );

	QUnit.test( '.implement( styles={ "css": [text, ..] } )', ( assert ) => {
		const $element = $( '<div class="mw-test-implement-a"></div>' ).appendTo( '#qunit-fixture' );

		assert.notStrictEqual(
			$element.css( 'float' ),
			'right',
			'style is clear'
		);

		mw.loader.implement(
			'test.implement.a',
			() => {
				assert.strictEqual(
					$element.css( 'float' ),
					'right',
					'style is applied'
				);
			},
			{
				css: [ '.mw-test-implement-a { float: right; }' ]
			}
		);

		return mw.loader.using( 'test.implement.a' );
	} );

	QUnit.test( '.implement( styles={ "url": { <media>: [url, ..] } } )', ( assert ) => {
		const $element1 = $( '<div class="mw-test-implement-b1"></div>' ).appendTo( '#qunit-fixture' ),
			$element2 = $( '<div class="mw-test-implement-b2"></div>' ).appendTo( '#qunit-fixture' ),
			$element3 = $( '<div class="mw-test-implement-b3"></div>' ).appendTo( '#qunit-fixture' ),
			done = assert.async();

		assert.notStrictEqual(
			$element1.css( 'text-align' ),
			'center',
			'style is clear'
		);
		assert.notStrictEqual(
			$element2.css( 'float' ),
			'left',
			'style is clear'
		);
		assert.notStrictEqual(
			$element3.css( 'text-align' ),
			'right',
			'style is clear'
		);

		mw.loader.implement(
			'test.implement.b',
			() => {
				// Note: done() must only be called when the entire test is
				// complete. So, make sure that we don't start until *both*
				// assertStyleAsync calls have completed.
				let pending = 2;
				assertStyleAsync( assert, $element2, 'float', 'left', () => {
					assert.notStrictEqual( $element1.css( 'text-align' ), 'center', 'print style is not applied' );

					pending--;
					if ( pending === 0 ) {
						done();
					}
				} );
				assertStyleAsync( assert, $element3, 'float', 'right', () => {
					assert.notStrictEqual( $element1.css( 'text-align' ), 'center', 'print style is not applied' );

					pending--;
					if ( pending === 0 ) {
						done();
					}
				} );
			},
			{
				url: {
					print: [ urlStyleTest( '.mw-test-implement-b1', 'text-align', 'center' ) ],
					screen: [
						// T42834: Make sure it actually works with more than 1 stylesheet reference
						urlStyleTest( '.mw-test-implement-b2', 'float', 'left' ),
						urlStyleTest( '.mw-test-implement-b3', 'float', 'right' )
					]
				}
			}
		);

		mw.loader.load( 'test.implement.b' );
	} );

	QUnit.test( '.implement( messages before script )', ( assert ) => {
		mw.loader.implement(
			'test.implement.order',
			() => {
				assert.strictEqual( mw.loader.getState( 'test.implement.order' ), 'executing', 'state during script execution' );
				assert.strictEqual( mw.msg( 'test-foobar' ), 'Hello Foobar, $1!', 'messages load before script execution' );
			},
			{},
			{
				'test-foobar': 'Hello Foobar, $1!'
			}
		);

		return mw.loader.using( 'test.implement.order' ).then( () => {
			assert.strictEqual( mw.loader.getState( 'test.implement.order' ), 'ready', 'final success state' );
		} );
	} );

	// @import (T33676)
	QUnit.test( '.implement( styles with @import )', ( assert ) => {
		let $element;
		const done = assert.async();

		mw.loader.implement(
			'test.implement.import',
			() => {
				$element = $( '<div class="mw-test-implement-import">Foo bar</div>' ).appendTo( '#qunit-fixture' );

				assertStyleAsync( assert, $element, 'float', 'right', () => {
					assert.strictEqual( $element.css( 'text-align' ), 'center',
						'CSS styles after the @import rule are working'
					);

					done();
				} );
			},
			{
				// @import always works in the first stylesheet.
				// Test with at least two stylesheets to excercise the special
				// condition in addEmbeddedCSS to support @import (end the batch
				// earlier than normal).
				css: [
					'.something-else-first {}',
					'@import url(\'' +
						urlStyleTest( '.mw-test-implement-import', 'float', 'right' ) +
						'\');\n' +
						'.mw-test-implement-import { text-align: center; }'
				]
			}
		);

		return mw.loader.using( 'test.implement.import' );
	} );

	QUnit.test( '.implement( dependency with styles )', ( assert ) => {
		const $element = $( '<div class="mw-test-implement-e"></div>' ).appendTo( '#qunit-fixture' ),
			$element2 = $( '<div class="mw-test-implement-e2"></div>' ).appendTo( '#qunit-fixture' );

		assert.notStrictEqual(
			$element.css( 'float' ),
			'right',
			'style is clear'
		);
		assert.notStrictEqual(
			$element2.css( 'float' ),
			'left',
			'style is clear'
		);

		mw.loader.register( [
			[ 'test.implement.e', '0', [ 'test.implement.e2' ] ],
			[ 'test.implement.e2', '0' ]
		] );

		mw.loader.implement(
			'test.implement.e',
			() => {
				assert.strictEqual(
					$element.css( 'float' ),
					'right',
					'Depending module\'s style is applied'
				);
			},
			{
				css: [ '.mw-test-implement-e { float: right; }' ]
			}
		);

		mw.loader.implement(
			'test.implement.e2',
			() => {
				assert.strictEqual(
					$element2.css( 'float' ),
					'left',
					'Dependency\'s style is applied'
				);
			},
			{
				css: [ '.mw-test-implement-e2 { float: left; }' ]
			}
		);

		return mw.loader.using( 'test.implement.e' );
	} );

	QUnit.test( '.implement( only scripts )', ( assert ) => {
		mw.loader.implement( 'test.onlyscripts', () => {} );
		return mw.loader.using( 'test.onlyscripts', () => {
			assert.strictEqual( mw.loader.getState( 'test.onlyscripts' ), 'ready' );
		} );
	} );

	QUnit.test( '.implement( only messages )', ( assert ) => {
		assert.false( mw.messages.exists( 'T31107' ), 'Verify that the test message doesn\'t exist yet' );

		mw.loader.implement( 'test.implement.msgs', [], {}, { T31107: 'loaded' } );

		return mw.loader.using( 'test.implement.msgs', () => {
			assert.true( mw.messages.exists( 'T31107' ), 'T31107: messages-only module should implement ok' );
		} );
	} );

	QUnit.test( '.implement( empty )', ( assert ) => {
		mw.loader.implement( 'test.empty' );
		return mw.loader.using( 'test.empty', () => {
			assert.strictEqual( mw.loader.getState( 'test.empty' ), 'ready' );
		} );
	} );

	QUnit.test( '.implement() [packageFiles long paths]', ( assert ) => {
		const done = assert.async();
		let initJsRan = false,
			counter = 41;
		mw.loader.implement(
			'test.implement.packageFiles',
			{
				main: 'resources/src/foo/init.js',
				files: {
					'resources/src/foo/data/hello.json': { hello: 'world' },
					'resources/src/foo/foo.js': function ( require, module ) {
						counter++;
						module.exports = { answer: counter };
					},
					'resources/src/bar/bar.js': function ( require, module ) {
						const core = require( './core.js' );
						module.exports = { data: core.sayHello( 'Alice' ) };
					},
					'resources/src/bar/core.js': function ( require, module ) {
						module.exports = { sayHello: function ( name ) {
							return 'Hello ' + name;
						} };
					},
					'resources/src/foo/init.js': function ( require ) {
						initJsRan = true;
						assert.deepEqual( require( './data/hello.json' ), { hello: 'world' }, 'require() with .json file' );
						assert.deepEqual( require( './foo.js' ), { answer: 42 }, 'require() with .js file in same directory' );
						assert.deepEqual( require( '../bar/bar.js' ), { data: 'Hello Alice' }, 'require() with ../ of a file that uses same-directory require()' );
						assert.deepEqual( require( './foo.js' ), { answer: 42 }, 'require()ing the same script twice only runs it once' );
					}
				}
			},
			{},
			{},
			{}
		);
		mw.loader.using( 'test.implement.packageFiles' ).done( () => {
			assert.true( initJsRan, 'main JS file is executed' );
			done();
		} );
	} );

	QUnit.test( '.implement() [packageFiles with parent files]', ( assert ) => {
		const done = assert.async();
		let initJsRan = false;
		let counter = 41;
		mw.loader.implement(
			'test.implement.packageWithParentFiles',
			{
				main: 'init.js',
				files: {
					'data/hello.json': { hello: 'world' },
					'foo.js': function ( require, module ) {
						counter++;
						module.exports = { answer: counter };
					},
					'../../lib/quux.js': function ( require, module ) {
						module.exports = 'Quux';
					},
					'../bar/bar.js': function ( require, module ) {
						const core = require( './core.js' );
						module.exports = { data: core.sayHello( 'Alice' ) };
					},
					'../bar/core.js': function ( require, module ) {
						module.exports = { sayHello: function ( name ) {
							return 'Hello ' + name;
						} };
					},
					'init.js': function ( require ) {
						initJsRan = true;
						assert.deepEqual( require( './data/hello.json' ), { hello: 'world' }, 'require() .json' );
						assert.deepEqual( require( './foo.js' ), { answer: 42 }, 'require() .js in same dir' );
						assert.deepEqual( require( '../bar/bar.js' ), { data: 'Hello Alice' }, 'require() with ../ ' );
						assert.deepEqual( require( '../../lib/quux.js' ), 'Quux', 'require() with ../../ ' );
						assert.deepEqual( require( './foo.js' ), { answer: 42 }, 'require() same script twice' );
					}
				}
			},
			{},
			{},
			{}
		);

		return mw.loader.using( 'test.implement.packageWithParentFiles' ).done( () => {
			assert.true( initJsRan, 'main JS file is executed' );
			done();
		} );
	} );

	QUnit.test( '.implement( name with @ )', ( assert ) => {
		const done = assert.async();
		// Calling implement() without a version number works if the '@' is the first character
		mw.loader.implement( '@foo/bar', ( $, jQuery, require, module ) => {
			module.exports = 'foobar';
		} );
		// If '@' is not the first character, a version number is required to resolve the ambiguity
		mw.loader.implement( 'baz@quux@123', ( $, jQuery, require, module ) => {
			module.exports = 'bazquux';
		} );

		assert.strictEqual( mw.loader.getState( '@foo/bar' ), 'loaded' );
		assert.strictEqual( mw.loader.getState( 'baz@quux' ), 'loaded' );
		mw.loader.using( [ '@foo/bar', 'baz@quux' ], ( require ) => {
			assert.strictEqual( mw.loader.getState( '@foo/bar' ), 'ready' );
			assert.strictEqual( require( '@foo/bar' ), 'foobar' );
			assert.strictEqual( mw.loader.getState( 'baz@quux' ), 'ready' );
			assert.strictEqual( require( 'baz@quux' ), 'bazquux' );
			done();
		} );
	} );

	QUnit.test( '.addSource()', ( assert ) => {
		mw.loader.addSource( { testsource1: 'https://1.test/src' } );

		assert.throws( () => {
			mw.loader.addSource( { testsource1: 'https://1.test/src' } );
		}, /already registered/, 'duplicate pair from addSource(Object)' );

		assert.throws( () => {
			mw.loader.addSource( { testsource1: 'https://1.test/src-diff' } );
		}, /already registered/, 'duplicate ID from addSource(Object)' );
	} );

	QUnit.test( '.register() - ES6 support always true', ( assert ) => {
		mw.loader.register( 'test1.regular', 'aaa' );
		mw.loader.register( 'test1.es6only', 'bbb!' );
		assert.strictEqual( mw.loader.getState( 'test1.regular' ), 'registered' );
		assert.strictEqual( mw.loader.getState( 'test1.es6only' ), 'registered' );
	} );

	// This is a regression test because in the past we called getCombinedVersion()
	// for all requested modules, before url splitting took place.
	// Discovered as part of T188076, but not directly related.
	QUnit.test( '.batchRequest() - Module version combines for given batch', ( assert ) => {
		mw.loader.register( [
			// [module, version, dependencies, group, source]
			[ 'testUrlInc', 'url', [], null, 'testloader' ],
			[ 'testUrlIncDump', 'dump', [], null, 'testloader' ]
		] );

		mw.loader.maxQueryLength = 10;

		return mw.loader.using( [ 'testUrlIncDump', 'testUrlInc' ] ).then( ( require ) => {
			assert.propEqual(
				require( 'testUrlIncDump' ).query,
				{
					modules: 'testUrlIncDump',
					// Expected: Combine hashes only for the module in the specific HTTP request
					//   hash fnv132 => "13e9zzn"
					// Wrong: Combine hashes for all requested modules, before request-splitting
					//   hash fnv132 => "18kz9ca"
					version: '13e9z'
				},
				'Query parameters'
			);

			assert.strictEqual( mw.loader.getState( 'testUrlInc' ), 'ready', 'testUrlInc also loaded' );
		} );
	} );

	// Regression test for T188076
	QUnit.test( '.batchRequest() - Module version combined based on sorted order', ( assert ) => {
		mw.loader.register( [
			// [module, version, dependencies, group, source]
			[ 'testUrlOrder', 'url', [], null, 'testloader' ],
			[ 'testUrlOrder.a', '1', [], null, 'testloader' ],
			[ 'testUrlOrder.b', '2', [], null, 'testloader' ],
			[ 'testUrlOrderDump', 'dump', [], null, 'testloader' ]
		] );

		return mw.loader.using( [
			'testUrlOrderDump',
			'testUrlOrder.b',
			'testUrlOrder.a',
			'testUrlOrder'
		] ).then( ( require ) => {
			assert.propEqual(
				require( 'testUrlOrderDump' ).query,
				{
					modules: 'testUrlOrder,testUrlOrderDump|testUrlOrder.a,b',
					// Expected: Combined by sorting names after string packing
					//   hash fnv132 = "1knqz"
					// Wrong: Combined by sorting names before string packing
					//   hash fnv132 => "11eo3s"
					version: '1knqz'
				},
				'Query parameters'
			);
		} );
	} );

	QUnit.test( 'Broken indirect dependency', function ( assert ) {
		this.useStubClock();

		// Don't actually emit an error event
		this.sandbox.stub( mw, 'trackError' );

		mw.loader.register( [
			[ 'test.module1', '0' ],
			[ 'test.module2', '0', [ 'test.module1' ] ],
			[ 'test.module3', '0', [ 'test.module2' ] ]
		] );
		mw.loader.implement( 'test.module1', () => {
			throw new Error( 'expected' );
		}, {}, {} );
		this.tick();

		assert.strictEqual( mw.loader.getState( 'test.module1' ), 'error', 'State of test.module1' );
		assert.strictEqual( mw.loader.getState( 'test.module2' ), 'error', 'State of test.module2' );
		assert.strictEqual( mw.loader.getState( 'test.module3' ), 'error', 'State of test.module3' );

		assert.strictEqual( mw.trackError.callCount, 1 );
	} );

	QUnit.test( 'Out-of-order implementation', function ( assert ) {
		this.useStubClock();

		mw.loader.register( [
			[ 'test.module4', '0' ],
			[ 'test.module5', '0', [ 'test.module4' ] ],
			[ 'test.module6', '0', [ 'test.module5' ] ]
		] );

		mw.loader.implement( 'test.module4', () => {} );
		this.tick();
		assert.strictEqual( mw.loader.getState( 'test.module4' ), 'ready', 'State of test.module4' );
		assert.strictEqual( mw.loader.getState( 'test.module5' ), 'registered', 'State of test.module5' );
		assert.strictEqual( mw.loader.getState( 'test.module6' ), 'registered', 'State of test.module6' );

		mw.loader.implement( 'test.module6', () => {} );
		this.tick();
		assert.strictEqual( mw.loader.getState( 'test.module4' ), 'ready', 'State of test.module4' );
		assert.strictEqual( mw.loader.getState( 'test.module5' ), 'registered', 'State of test.module5' );
		assert.strictEqual( mw.loader.getState( 'test.module6' ), 'loaded', 'State of test.module6' );

		mw.loader.implement( 'test.module5', () => {} );
		this.tick();
		assert.strictEqual( mw.loader.getState( 'test.module4' ), 'ready', 'State of test.module4' );
		assert.strictEqual( mw.loader.getState( 'test.module5' ), 'ready', 'State of test.module5' );
		assert.strictEqual( mw.loader.getState( 'test.module6' ), 'ready', 'State of test.module6' );
	} );

	QUnit.test( 'Missing dependency', function ( assert ) {
		this.useStubClock();

		mw.loader.register( [
			[ 'test.module7', '0' ],
			[ 'test.module8', '0', [ 'test.module7' ] ],
			[ 'test.module9', '0', [ 'test.module8' ] ]
		] );

		mw.loader.implement( 'test.module8', () => {} );
		this.tick();
		assert.strictEqual( mw.loader.getState( 'test.module7' ), 'registered', 'Expected "registered" state for test.module7' );
		assert.strictEqual( mw.loader.getState( 'test.module8' ), 'loaded', 'Expected "loaded" state for test.module8' );
		assert.strictEqual( mw.loader.getState( 'test.module9' ), 'registered', 'Expected "registered" state for test.module9' );

		mw.loader.state( { 'test.module7': 'missing' } );
		this.tick();
		assert.strictEqual( mw.loader.getState( 'test.module7' ), 'missing', 'Expected "missing" state for test.module7' );
		assert.strictEqual( mw.loader.getState( 'test.module8' ), 'error', 'Expected "error" state for test.module8' );
		assert.strictEqual( mw.loader.getState( 'test.module9' ), 'error', 'Expected "error" state for test.module9' );

		mw.loader.implement( 'test.module9', () => {} );
		this.tick();
		assert.strictEqual( mw.loader.getState( 'test.module7' ), 'missing', 'Expected "missing" state for test.module7' );
		assert.strictEqual( mw.loader.getState( 'test.module8' ), 'error', 'Expected "error" state for test.module8' );
		assert.strictEqual( mw.loader.getState( 'test.module9' ), 'error', 'Expected "error" state for test.module9' );

		// Restore clock for QUnit and $.Deferred internals
		this.clock.restore();
		return mw.loader.using( [ 'test.module7' ] ).then(
			() => {
				throw new Error( 'Success fired despite missing dependency' );
			},
			( e, dependencies ) => {
				assert.true( Array.isArray( dependencies ), 'Expected array of dependencies' );
				assert.deepEqual(
					dependencies,
					[ 'jquery', 'mediawiki.base', 'test.module7' ],
					'Error callback called with module test.module7'
				);
			}
		).then( () => mw.loader.using( [ 'test.module9' ] ) ).then(
			() => {
				throw new Error( 'Success fired despite missing dependency' );
			},
			( e, dependencies ) => {
				assert.true( Array.isArray( dependencies ), 'Expected array of dependencies' );
				dependencies.sort();
				assert.deepEqual(
					dependencies,
					[ 'jquery', 'mediawiki.base', 'test.module7', 'test.module8', 'test.module9' ],
					'Error callback called with all three modules as dependencies'
				);
			}
		);
	} );

	QUnit.test( 'Dependency handling', ( assert ) => {
		mw.loader.register( [
			// [module, version, dependencies, group, source]
			[ 'testMissing', '1', [], null, 'testloader' ],
			[ 'testUsesMissing', '1', [ 'testMissing' ], null, 'testloader' ],
			[ 'testUsesNestedMissing', '1', [ 'testUsesMissing' ], null, 'testloader' ]
		] );

		function verifyModuleStates() {
			assert.strictEqual( mw.loader.getState( 'testMissing' ), 'missing', 'Module "testMissing" state' );
			assert.strictEqual( mw.loader.getState( 'testUsesMissing' ), 'error', 'Module "testUsesMissing" state' );
			assert.strictEqual( mw.loader.getState( 'testUsesNestedMissing' ), 'error', 'Module "testUsesNestedMissing" state' );
		}

		return mw.loader.using( [ 'testUsesNestedMissing' ] ).then(
			() => {
				verifyModuleStates();
				throw new Error( 'Error handler should be invoked.' );
			},
			( e, modules ) => {
				// When the server sets state of 'testMissing' to 'missing'
				// it should bubble up and trigger the error callback of the job for 'testUsesNestedMissing'.
				assert.true( modules.includes( 'testMissing' ), 'Triggered by testMissing.' );

				verifyModuleStates();
			}
		);
	} );

	// Regresion test for T68598
	QUnit.test( 'Network failure', function ( assert ) {
		// Modules named "test.*Dump" always exist via load.mock.php (testloader)
		mw.loader.register( [
			// [module, version, dependencies, group, source, skip]
			[ 'testNetfailBadDump', '1', [], 'unlucky', 'testloader' ],
			[ 'testNetfailGoodDump', '1', [], 'lucky', 'testloader' ],
			[ 'testNetfailDump', '1', [ 'testNetfailBadDump', 'testNetfailGoodDump' ], null, 'testloader' ]
		] );

		// Simulate network failure
		const appendSuper = document.head.appendChild;
		const appendStub = this.sandbox.stub( document.head, 'appendChild', function ( node ) {
			if ( node.nodeName === 'SCRIPT' && node.src.includes( 'testNetfailBadDump' ) ) {
				Promise.resolve().then( node.onerror );
				appendStub.restore();
				return;
			}
			return appendSuper.apply( this, arguments );
		} );

		return mw.loader.using( [ 'testNetfailDump' ] ).then(
			() => {
				throw new Error( 'Unexpected success.' );
			},
			( e, modules ) => {
				assert.propEqual( {
					testNetfailDump: mw.loader.getState( 'testNetfailDump' ),
					testNetfailBadDump: mw.loader.getState( 'testNetfailBadDump' )
				}, {
					testNetfailDump: 'error',
					testNetfailBadDump: 'error'
				}, 'module state' );

				assert.strictEqual( e.message, 'Failed dependency: testNetfailBadDump', 'error message' );
				assert.true( modules.includes( 'testNetfailBadDump' ), 'attribute failure' );
			}
		);
	} );

	QUnit.test( 'Skip-function handling', ( assert ) => {
		mw.loader.register( [
			// [module, version, dependencies, group, source, skip]
			[ 'testSkipped', '1', [], null, 'testloader', 'return true;' ],
			[ 'testNotSkipped', '1', [], null, 'testloader', 'return false;' ],
			[ 'testUsesSkippable', '1', [ 'testSkipped', 'testNotSkipped' ], null, 'testloader' ]
		] );

		return mw.loader.using( [ 'testUsesSkippable' ] ).then(
			() => {
				assert.strictEqual( mw.loader.getState( 'testSkipped' ), 'ready', 'Skipped module' );
				assert.strictEqual( mw.loader.getState( 'testNotSkipped' ), 'ready', 'Regular module' );
				assert.strictEqual( mw.loader.getState( 'testUsesSkippable' ), 'ready', 'Regular module with skippable dependency' );
			},
			( e, badmodules ) => {
				// Should not fail and QUnit would already catch this,
				// but add a handler anyway to report details from 'badmodules
				assert.deepEqual( badmodules, [], 'Bad modules' );
			}
		);
	} );

	// This bug was fixed in MediaWiki 1.18 (T32825).
	QUnit.test( '.load() [protocol-relative URL T32825]', ( assert ) => {
		const done = assert.async();
		let target = SCRIPT_PATH_URL + 'tests/qunit/data/mwLoaderTestCallback.js';
		// Use a protocol-relative URL for this test
		target = target.replace( /https?:/, '' );
		assert.true( target.startsWith( '//' ), 'URL is protocol-relative' );

		mw.loader.testCallback = function () {
			// Ensure once, delete now
			delete mw.loader.testCallback;
			assert.true( true, 'callback' );
			done();
		};

		// Go!
		mw.loader.load( target );
	} );

	QUnit.test( '.load() [absolute URL]', ( assert ) => {
		const done = assert.async();
		const target = SCRIPT_PATH_URL + 'tests/qunit/data/mwLoaderTestCallback.js';

		mw.loader.testCallback = function () {
			// Ensure once, delete now
			delete mw.loader.testCallback;
			assert.true( true, 'callback' );
			done();
		};

		// Go!
		mw.loader.load( target );
	} );

	QUnit.test( 'importScript()', function ( assert ) {
		/* global importScript */
		mw.config.set( 'wgScript', '/w/index.php' );
		const stub = this.sandbox.stub( mw.loader, 'addScriptTag' );

		importScript( 'User:Foo bar!/Scripts=Love/example@2.js' );
		assert.deepEqual( stub.getCall( 0 ).args, [
			'/w/index.php?title=User:Foo_bar!/Scripts%3DLove/example@2.js&action=raw&ctype=text/javascript'
		] );
	} );

	QUnit.test( 'importStylesheet()', function ( assert ) {
		/* global importStylesheet */
		mw.config.set( 'wgScript', '/w/index.php' );
		const stub = this.sandbox.stub( mw.loader, 'addLinkTag' );

		importStylesheet( 'User:Foo bar!/Scripts=Love/example@2.css' );
		assert.deepEqual( stub.getCall( 0 ).args, [
			'/w/index.php?title=User:Foo_bar!/Scripts%3DLove/example@2.css&action=raw&ctype=text/css'
		] );
	} );

	QUnit.test( 'Empty string module name - T28804', ( assert ) => {
		let done = false;

		assert.strictEqual( mw.loader.moduleRegistry[ '' ], undefined, 'Unregistered' );

		mw.loader.register( '', 'v1' );
		assert.strictEqual( mw.loader.moduleRegistry[ '' ].state, 'registered', 'State before' );
		assert.strictEqual( mw.loader.moduleRegistry[ '' ].version, 'v1', 'Version' );

		mw.loader.implement( '', () => {
			done = true;
		} );

		return mw.loader.using( '', () => {
			assert.true( done, 'script ran' );
			assert.strictEqual( mw.loader.moduleRegistry[ '' ].state, 'ready', 'State after' );
		} );
	} );

	QUnit.test( 'Executing race - T112232', ( assert ) => {
		let done = false;

		// The red herring schedules its CSS buffer first. In T112232, a bug in the
		// state machine would cause the job for testRaceLoadMe to run with an earlier job.
		mw.loader.implement(
			'testRaceRedHerring',
			() => {},
			{ css: [ '.mw-testRaceRedHerring {}' ] }
		);
		mw.loader.implement(
			'testRaceLoadMe',
			() => {
				done = true;
			},
			{ css: [ '.mw-testRaceLoadMe { float: left; }' ] }
		);

		mw.loader.load( [ 'testRaceRedHerring', 'testRaceLoadMe' ] );
		return mw.loader.using( 'testRaceLoadMe', () => {
			assert.true( done, 'script ran' );
			assert.strictEqual( mw.loader.getState( 'testRaceLoadMe' ), 'ready', 'state' );
		} );
	} );

	QUnit.test( 'Stale response caching - T117587', function ( assert ) {
		let count = 0;
		// Enable store and stub timeout/idle scheduling
		this.sandbox.stub( mw.loader.store, 'enabled', true );
		this.sandbox.stub( window, 'setTimeout', ( fn ) => {
			fn();
		} );
		this.sandbox.stub( mw, 'requestIdleCallback', ( fn ) => {
			fn();
		} );

		mw.loader.register( 'test.stale', 'v2' );
		assert.false( mw.loader.store.get( 'test.stale' ), 'Not in store' );

		mw.loader.impl( () => [
			'test.stale@v1',
			function () {
				count++;
			}
		] );

		return mw.loader.using( 'test.stale' )
			.then( () => {
				assert.strictEqual( count, 1 );
				// After implementing, registry contains version as implemented by the response.
				assert.strictEqual( mw.loader.moduleRegistry[ 'test.stale' ].version, 'v1', 'Override version' );
				assert.strictEqual( mw.loader.moduleRegistry[ 'test.stale' ].state, 'ready' );
				assert.strictEqual( typeof mw.loader.store.get( 'test.stale' ), 'string', 'In store' );
			} )
			.then( () => {
				// Reset run time, but keep mw.loader.store
				mw.loader.moduleRegistry[ 'test.stale' ].script = undefined;
				mw.loader.moduleRegistry[ 'test.stale' ].state = 'registered';
				mw.loader.moduleRegistry[ 'test.stale' ].version = 'v2';

				// Module was stored correctly as v1
				// On future navigations, it will be ignored until evicted
				assert.false( mw.loader.store.get( 'test.stale' ), 'Not in store' );
			} );
	} );

	QUnit.test( 'No storing of group=private responses', function ( assert ) {
		const name = 'test.group.priv';

		// Enable store and stub timeout/idle scheduling
		this.sandbox.stub( mw.loader.store, 'enabled', true );
		this.sandbox.stub( window, 'setTimeout', ( fn ) => {
			fn();
		} );
		this.sandbox.stub( mw, 'requestIdleCallback', ( fn ) => {
			fn();
		} );

		// See ResourceLoader\StartUpModule::$groupIds
		mw.loader.register( name, 'x', [], 1 );
		assert.false( mw.loader.store.get( name ), 'Not in store' );

		mw.loader.implement( name, () => {} );
		return mw.loader.using( name ).then( () => {
			assert.strictEqual( mw.loader.getState( name ), 'ready' );
			assert.false( mw.loader.store.get( name ), 'Still not in store' );
		} );
	} );

	QUnit.test( 'No storing of group=user responses', function ( assert ) {
		const name = 'test.group.user';

		// Enable store and stub timeout/idle scheduling
		this.sandbox.stub( mw.loader.store, 'enabled', true );
		this.sandbox.stub( window, 'setTimeout', ( fn ) => {
			fn();
		} );
		this.sandbox.stub( mw, 'requestIdleCallback', ( fn ) => {
			fn();
		} );

		// See ResourceLoader\StartUpModule::$groupIds
		mw.loader.register( name, 'y', [], 0 );
		assert.false( mw.loader.store.get( name ), 'Not in store' );

		mw.loader.implement( name, () => {} );
		return mw.loader.using( name ).then( () => {
			assert.strictEqual( mw.loader.getState( name ), 'ready' );
			assert.false( mw.loader.store.get( name ), 'Still not in store' );
		} );
	} );

	QUnit.test( 'mw.loader.store.load - Disallowed localStorage', function ( assert ) {
		this.stubStore();
		this.sandbox.stub( Storage.prototype, 'getItem', () => {
			throw new Error( 'Mock-disabled localStorage' );
		} );

		mw.loader.store.load();
		assert.false( mw.loader.store.enabled, 'Disabled' );
	} );

	QUnit.test( 'mw.loader.store.load - Invalid JSON', function ( assert ) {
		this.stubStore();
		localStorage.setItem( mw.loader.store.key, 'invalid' );

		mw.loader.store.load();
		assert.true( mw.loader.store.enabled, 'Enabled' );
		assert.true( $.isEmptyObject( mw.loader.store.items ), 'Items stay empty' );
	} );

	QUnit.test( 'mw.loader.store.load - Unusable JSON', function ( assert ) {
		this.stubStore();
		localStorage.setItem( mw.loader.store.key, JSON.stringify( { wrong: true } ) );

		mw.loader.store.load();
		assert.true( mw.loader.store.enabled, 'Enabled' );
		assert.true( $.isEmptyObject( mw.loader.store.items ), 'Items stay empty' );
	} );

	QUnit.test( 'mw.loader.store.load - Expired JSON', function ( assert ) {
		this.stubStore();
		localStorage.setItem( mw.loader.store.key, JSON.stringify( {
			items: { use: 'not me' },
			vary: mw.loader.store.vary,
			asOf: 130161 // 2011-04-01 12:00
		} ) );

		mw.loader.store.load();
		assert.true( mw.loader.store.enabled, 'Enabled' );
		assert.true( $.isEmptyObject( mw.loader.store.items ), 'Items stay empty' );
	} );

	QUnit.test( 'mw.loader.store.load - Good JSON', function ( assert ) {
		this.stubStore();
		localStorage.setItem( mw.loader.store.key, JSON.stringify( {
			items: { use: 'me' },
			vary: mw.loader.store.vary,
			asOf: Math.ceil( Date.now() / 1e7 ) - 5 // ~ 13 hours ago
		} ) );

		mw.loader.store.load();
		assert.true( mw.loader.store.enabled, 'Enabled' );
		assert.deepEqual(
			mw.loader.store.items,
			{ use: 'me' },
			'Items are loaded'
		);
	} );

	QUnit.test( 'require()', ( assert ) => {
		mw.loader.register( [
			[ 'test.require1', '0' ],
			[ 'test.require2', '0' ],
			[ 'test.require3', '0' ],
			[ 'test.require4', '0', [ 'test.require3' ] ]
		] );
		mw.loader.implement( 'test.require1', () => {} );
		mw.loader.implement( 'test.require2', ( $, jQuery, require, module ) => {
			module.exports = 1;
		} );
		mw.loader.implement( 'test.require3', ( $, jQuery, require, module ) => {
			module.exports = function () {
				return 'hello world';
			};
		} );
		mw.loader.implement( 'test.require4', ( $, jQuery, require, module ) => {
			const other = require( 'test.require3' );
			module.exports = {
				pizza: function () {
					return other();
				}
			};
		} );
		return mw.loader.using( [ 'test.require1', 'test.require2', 'test.require3', 'test.require4' ] ).then( ( require ) => {
			const module1 = require( 'test.require1' );
			const module2 = require( 'test.require2' );
			const module3 = require( 'test.require3' );
			const module4 = require( 'test.require4' );

			assert.strictEqual( typeof module1, 'object', 'export of module with no export' );
			assert.strictEqual( module2, 1, 'export a number' );
			assert.strictEqual( module3(), 'hello world', 'export a function' );
			assert.strictEqual( typeof module4.pizza, 'function', 'export an object' );
			assert.strictEqual( module4.pizza(), 'hello world', 'module can require other modules' );

			assert.throws( () => {
				require( '_badmodule' );
			}, /is not loaded/, 'Requesting non-existent modules throws error.' );
		} );
	} );

	QUnit.test( 'require() in debug mode', ( assert ) => {
		mw.loader.register( [
			[ 'test.require.define', '0' ],
			[ 'test.require.callback', '0', [ 'test.require.define' ] ]
		] );
		mw.loader.implement( 'test.require.callback', [ SCRIPT_PATH_URL + 'tests/qunit/data/requireCallMwLoaderTestCallback.js' ] );
		mw.loader.implement( 'test.require.define', [ SCRIPT_PATH_URL + 'tests/qunit/data/defineCallMwLoaderTestCallback.js' ] );

		return mw.loader.using( 'test.require.callback' ).then( ( require ) => {
			const cb = require( 'test.require.callback' );
			assert.strictEqual( cb.immediate, 'Defined.', 'module.exports and require work in debug mode' );
			// Must use try-catch because cb.later() will throw if require is undefined,
			// which doesn't work well inside Deferred.then() when using jQuery 1.x with QUnit
			try {
				assert.strictEqual( cb.later(), 'Defined.', 'require works asynchrously in debug mode' );
			} catch ( e ) {
				assert.strictEqual( String( e ), null, 'require works asynchrously in debug mode' );
			}
		} );
	} );

	QUnit.test( '.require() relative file without packageFiles', ( assert ) => {
		// T386833
		assert.throws( () => {
			mw.loader.require( './hello.js' );
		}, /Module names cannot start with ".\/" or "..\/"/ );
	} );

	QUnit.test( 'Implicit dependencies', ( assert ) => {
		let user = 0,
			site = 0,
			siteFromUser = 0;

		mw.loader.implement(
			'site',
			() => {
				site++;
			}
		);
		mw.loader.implement(
			'user',
			() => {
				user++;
				siteFromUser = site;
			}
		);

		return mw.loader.using( 'user', () => {
			assert.strictEqual( site, 1, 'site module' );
			assert.strictEqual( user, 1, 'user module' );
			assert.strictEqual( siteFromUser, 1, 'site ran before user' );
		} ).always( () => {
			// Reset
			mw.loader.moduleRegistry.site.state = 'registered';
			mw.loader.moduleRegistry.user.state = 'registered';
		} );
	} );

	QUnit.test( '.getScript() - success', ( assert ) => {
		const scriptUrl = SCRIPT_PATH_URL + 'tests/qunit/data/mediawiki.loader.getScript.example.js';

		return mw.loader.getScript( scriptUrl ).then(
			() => {
				assert.true( mw.getScriptExampleScriptLoaded, 'Data attached to a global object is available' );
			}
		);
	} );

	QUnit.test( '.getScript() - failure', ( assert ) => {
		assert.rejects(
			mw.loader.getScript( '/this-is-not-found.txt' ),
			/Failed to load script/,
			'Descriptive error message'
		);
	} );

}() );
