var _ = require('lodash'),
  async = require('async'),
  shell = require('shelljs'),
  gsheet = require('google-spreadsheet');

module.exports = function npmDependenciesSpreadsheet(options, callback) {
  var doc, sheet, creds = {
    client_email: options.email,
    private_key: options.token
  };

  var repoName, deps = {}, existingDeps;

  return async.series([
    authenticate,
    getSheetInfo,
    getDependencies,
    readDependencyRows,
    writeDependencyRows
  ], onUpdatedOrError);

  function authenticate(next) {
    try {
      doc = new gsheet(options.sheet);
      doc.useServiceAccountAuth(creds, next);
    } catch (newDocErr) {
      return next(newDocErr);
    }
  }

  function getSheetInfo(next) {
    doc.getInfo(function(err, info) {
      sheet = info.worksheets[0];
      return next(err);
    });
  }

  function getDependencies(next) {
    if (!options.basePath) {
      return next(new Error(`Invalid basePath provided in options: ${options.basePath}`));
    }

    var rootpkg = require(`${options.basePath}/package.json`);
    repoName = rootpkg.name;

    // Add direct dependencies
    Object.keys(rootpkg.dependencies).forEach((dep) => {
      var pkg = require(`${options.basePath}/node_modules/${dep}/package.json`);

      deps[dep] = {
        repository: repoName,
        name: pkg.name,
        version: pkg.version,
        license: getLicense(pkg),
        url: getUrl(pkg),
        direct: true
      };
    });

    // Add indirect dependencies
    shell.exec(`find ${options.basePath}/node_modules/**/package.json`, {silent: true},
      (code, output) => {
      _.each(output.split('\n'), (pkgPath) => {
        var dep, pkg;

        // Ignore it if it's not a package
        if (pkgPath.indexOf('package.json') === -1) {
          return;
        }

        pkg = require(pkgPath);

        // Don't overwrite direct deps
        if (deps[pkg.name] && deps[pkg.name].version === pkg.version) {
          return;
        }

        dep = {
          repository: repoName,
          name: pkg.name,
          version: pkg.version,
          license: getLicense(pkg),
          url: getUrl(pkg),
          direct: false
        };

        if (deps[dep.name] && deps[dep.name].version !== dep.version) {
          deps[`${dep.name}_${dep.version}`] = dep;
        } else {
          deps[dep.name] = dep;
        }
      });

      return next();
    });

    function getLicense(pkg) {
      if (pkg.license) {
        return pkg.license.type || pkg.license;
      } else {
        return '';
      }
    }

    function getUrl(pkg) {
      var url = pkg.homepage || '';

      if (!url && pkg.repository) {
        url = pkg.repository.url;
      }

      return url;
    }
  }

  function readDependencyRows(next) {
    var query_options = {
      offset: 1,
      query: `repository=${repoName}`,
      orderby: 'name'
    };

    sheet.getRows(query_options, (err, rows) => {
      if (err) {
        return next(err);
      }

      existingDeps = rows;
      ensureRowsDeleted(rows);
    });

    // The google API doesn't guarantee that a row will be deleted.
    // After trying to delete all rows, check if we missed any, and
    // then delete them. When 0 rows are returned, we continue with
    // 'next'. This is horrendous.
    function ensureRowsDeleted(rows) {
      async.whilst(
        () => rows.length,
        (cb) => {
          async.eachSeries(rows, (row, delCb) => row.del(delCb), () => {
            sheet.getRows(query_options, (err, _rows) => {
              rows = _rows;
              cb();
            });
          });
        },
        next);
    }
  }

  function writeDependencyRows(next) {
    async.eachSeries(deps, (dep, cb) => {
      // see if this dependency is existing.
      existingDep = _.filter(existingDeps, {'name': dep.name})[0];

      // if the license was missing but we added one manually, preserve it.
      if (!dep.license && existingDep) {
        dep.license = existingDep.license;
      }

      // if the version changed, or the dependency is new, flag it.
      dep.updated = (!existingDep || dep.version !== existingDep.version);

      sheet.addRow(dep, cb);
    }, next);
  }

  function onUpdatedOrError(err) {
    console.log(`An error was encountered.`);
    console.error(err);
    return callback(err);
  }
};
