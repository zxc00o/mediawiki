( function () {

	const config = require( './config.json' );

	/**
	 * @classdesc Upload to another MediaWiki site.
	 *
	 * Subclassed to upload to a foreign API, with no other goodies. Use
	 * this for a generic foreign image repository on your wiki farm.
	 *
	 * Note you can provide the `target` or not - if the first argument is
	 * an object, we assume you want the default, and treat it as apiconfig
	 * instead.
	 *
	 * @class mw.ForeignUpload
	 * @extends mw.Upload
	 *
	 * @constructor
	 * @description Used to represent an upload in progress on the frontend.
	 * @param {string} [target] Used to set up the target
	 *     wiki. If not remote, this class behaves identically to mw.Upload (unless further subclassed)
	 *     Use the same names as set in $wgForeignFileRepos for this. Also,
	 *     make sure there is an entry in the $wgForeignUploadTargets array for this name.
	 * @param {Object} [apiconfig] Passed to the constructor of {@link mw.ForeignApi} or {@link mw.Api}, as needed.
	 */
	function ForeignUpload( target, apiconfig ) {
		const validTargets = config.ForeignUploadTargets;

		if ( typeof target === 'object' ) {
			// target probably wasn't passed in, it must
			// be apiconfig
			apiconfig = target;
			target = undefined;
		}

		// * Use the given `target` first;
		// * If not given, fall back to default (first) ForeignUploadTarget;
		// * If none is configured, fall back to local uploads.
		this.target = target || validTargets[ 0 ] || 'local';

		// Now we have several different options.
		// If the local wiki is the target, then we can skip a bunch of steps
		// and just return an mw.Api object, because we don't need any special
		// configuration for that.
		// However, if the target is a remote wiki, we must check the API
		// to confirm that the target is one that this site is configured to
		// support.
		if ( validTargets.length === 0 ) {
			this.apiPromise = $.Deferred().reject( 'upload-dialog-disabled' );
		} else if ( this.target === 'local' ) {
			// If local uploads were requested, but they are disabled, fail.
			if ( !config.EnableUploads ) {
				this.apiPromise = $.Deferred().reject( 'uploaddisabledtext' );
			} else {
				// We'll ignore the CORS and centralauth stuff if the target is
				// the local wiki.
				this.apiPromise = $.Deferred().resolve( new mw.Api( apiconfig ) );
			}
		} else {
			const api = new mw.Api();
			this.apiPromise = api.get( {
				action: 'query',
				meta: 'filerepoinfo',
				friprop: [ 'name', 'scriptDirUrl', 'canUpload' ]
			} ).then( ( data ) => {
				const repos = data.query.repos;

				// First pass - try to find the passed-in target and check
				// that it's configured for uploads.
				for ( const i in repos ) {
					const repo = repos[ i ];

					// Skip repos that are not our target, or if they
					// are the target, cannot be uploaded to.
					if ( repo.name === this.target && repo.canUpload === '' ) {
						return new mw.ForeignApi(
							repo.scriptDirUrl + '/api.php',
							apiconfig
						);
					}
				}

				return $.Deferred().reject( 'upload-foreign-cant-upload' );
			} );
		}

		// Build the upload object without an API - this class overrides the
		// actual API call methods to wait for the apiPromise to resolve
		// before continuing.
		mw.Upload.call( this, null );
	}

	OO.inheritClass( ForeignUpload, mw.Upload );

	/**
	 * Used to specify the target repository of the upload.
	 *
	 * If you set this to something that isn't 'local', you must be sure to
	 * add that target to $wgForeignUploadTargets in LocalSettings, and the
	 * repository must be set up to use CORS and CentralAuth.
	 *
	 * Most wikis use "shared" to refer to Wikimedia Commons, we assume that
	 * in this class and in the messages linked to it.
	 *
	 * Defaults to the first available foreign upload target,
	 * or to local uploads if no foreign target is configured.
	 *
	 * @name mw.ForeignUpload.target
	 * @type {string}
	 */

	/**
	 * @inheritdoc
	 */
	ForeignUpload.prototype.getApi = function () {
		return this.apiPromise;
	};

	/**
	 * Override from mw.Upload to make sure the API info is found and allowed
	 *
	 * @inheritdoc
	 */
	ForeignUpload.prototype.upload = function () {
		return this.apiPromise.then( ( api ) => {
			this.api = api;
			return mw.Upload.prototype.upload.call( this );
		} );
	};

	/**
	 * Override from mw.Upload to make sure the API info is found and allowed
	 *
	 * @inheritdoc
	 */
	ForeignUpload.prototype.uploadToStash = function () {
		return this.apiPromise.then( ( api ) => {
			this.api = api;
			return mw.Upload.prototype.uploadToStash.call( this );
		} );
	};

	mw.ForeignUpload = ForeignUpload;
}() );
