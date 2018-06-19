import makeDebug from 'debug';
const debug = makeDebug('ember-auto-import:splitter');

export default class Splitter {
  private _bundles;
  private _depFinder;
  private _config;
  private _analyzer;
  private _lastImports;
  private _lastDeps;
  private _usersBundleForPath;

  constructor(options) {
    // list of bundle names in priority order
    this._bundles = options.bundles;

    this._depFinder = options.depFinder;
    this._config = (options.config && options.config.modules) || {};
    this._analyzer = options.analyzer;
    this._lastImports = null;
    this._lastDeps = null;
    this._usersBundleForPath = options.bundleForPath;
  }

  async depsForBundle(bundleName) {
    let imports = this._analyzer.imports;
    if (!this._lastDeps || this._lastImports !== imports) {
      this._lastDeps = await this._computeDeps(imports);
      debug('splitter %j', this._lastDeps);
    }
    return this._lastDeps[bundleName];
  }

  async _computeDeps(imports) {
    let deps = {};

    this._bundles.forEach(bundleName => {
      deps[bundleName] = {};
    });

    await Promise.all(Object.keys(imports).map(async sourcePath => {

      if (sourcePath[0] === '.' || sourcePath[0] === '/') {
        // we're only trying to identify imports of external NPM
        // packages, so relative imports are never relevant.
        return;
      }

      let parts = sourcePath.split('/');
      let packageName;
      if (sourcePath[0] === '@') {
        packageName = `${parts[0]}/${parts[1]}`;
      } else {
        packageName = parts[0];
      }

      let config = this._config[packageName];
      if (config && typeof config.include === 'boolean' && !config.include) {
        return;
      }
      if (!this._depFinder.hasDependency(packageName) || this._depFinder.isEmberAddon(packageName)) {
        return;
      }
      this._depFinder.assertAllowed(packageName);

      let bundleName = this._chooseBundle(imports[sourcePath]);

      deps[bundleName][sourcePath] = {
        entrypoint: await this._depFinder.entryPoint(sourcePath)
      };
    }));

    return deps;
  }

  // given that a module is imported by the given list of paths, which
  // bundle should it go in?
  _chooseBundle(paths) {
    let usedInBundles = {};
    paths.forEach(path => {
      usedInBundles[this._bundleForPath(path)] = true;
    });
    return this._bundles.find(bundle => usedInBundles[bundle]);
  }

  _bundleForPath(path) {
    let bundleName = this._usersBundleForPath(path);
    if (this._bundles.indexOf(bundleName) === -1) {
      throw new Error(`bundleForPath("${path}") returned ${bundleName}" but the only configured bundle names are ${this._bundles.join(',')}`);
    }
    debug('bundleForPath("%s")=%s', path, bundleName);
    return bundleName;
  }
}