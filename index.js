var _ = require('lodash'),
  async = require('async'),
  shell = require('shelljs'),
  gsheet = require('google-spreadsheet');

module.exports = 1;

function npmDependenciesSpreadsheet(options, callback) {
  var doc, sheet, creds = {
    client_email: options.email,
    private_key: options.token
  };

  var repoName, deps = {};

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
      console.log('Loaded doc: '+info.title+' by '+info.author.email);
      sheet = info.worksheets[0];
      console.log('Found sheet: '+sheet.title+' '+sheet.rowCount+'x'+sheet.colCount);
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

        if (deps[dep.name]) {
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
    return next();

    sheet.getCells({
      'min-row': 2,
      'max-row': sheet.rowCount,
      'return-empty': false
    }, (err, cells) => {
      var rows = {};
      _.each(cells, (cell) => {
        if (!rows[cell.row]) {
          rows[cell.row] = {};
        }

        rows[cell.row][cell.col] = cell;
      });

      //console.dir(rows);
    });
  }

  function writeDependencyRows(next) {
    async.eachSeries(deps, (dep, cb) => {
      sheet.addRow(dep, cb);
    }, next);
  }

  function onUpdatedOrError(err) {
    return callback(err);
  }
}

npmDependenciesSpreadsheet({
    email: 'hce-dependencies@appspot.gserviceaccount.com',
    token: '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCdfz9M6diWt+AL\nbn5YVicxxsJe87K1AwVGH6z/ki71TqF9fMl6RD+8OMu4qSgd7IlqZNKxMlQJ83ac\n7rGTMBdGEfRoKHGAGmlVNm6KhF0KH/KuG/7t3dajvs31UxgOtYqyqNxcKEoyjEtX\nJvhWGNOgGorLHtFVNJhjpr5bUddM2dLur0XlozjxMaBW7+EZGZ6T1EVMu70/1l9F\nYUMA0Yq3L34YD2jyjfJYsvEZ1nHPdl8O10J90gVdcyGR7eWfogVeEbMrOraqeP1x\nDV3h00y138/5pwheHNOVjRgwnB+bhDTgul4bHkOm44VLFzqFOp0G/NRHp4M5FHMp\nUkkadrZPAgMBAAECggEAVu4eNUi5WG9DRWwGZqGe3pWTQS+HiuuQ5KSlKyc3rgRp\nlEblOgwjlbNPlqwfTWz6Z/QgateZlSiBZptE/jXEEtPkL/1qsEdjrjnuB5yJcgYy\nP7GKIyaXyyeMrIThuXSwim4zutYuJfpTt1X2Kidn323m/7gR2NK/7fjiBquEh5Cw\n5CbHfF/gQXQauvP7kNkwEYO7iwTZKME96XrGXUgjyiqi9Wc62FJ5d5eFsb0OUdcK\n9GLTOIJ2DbvYK5L9IXc9olY9LECb8zpuuGm5UWS6qKhWZaqjC3rS/M29A6rEq2tp\n8UVI4ak+XBDOiA/LDIAyYWVUY7THUJAWEKuu7SC6IQKBgQDX0EnP5l6QtbVZJB7r\ngCXolMfTK1OpFDrkH352bY2utWcOBQ/gv5wLQTH/9l/f6+g2L9GtaKVDvl42vMXE\ncbMSypaDqad2dUUXwtqBBj4EDuFrsycQ442mFPd8OaENXew0+dBHeXFx0TaUREkR\nhxBEtvrEueXHeVUd+fSzjmp0/wKBgQC60wqr3fCG9eht2J0Q/n75hzE2AVSSspQ4\n6IXJL1cEQJUHYeKibD73fS4zlzX/fFGuIUWpRXUCcj+91V4xlLf1MMca6Ib/uPC1\nIfSoKvsWaMPJLHEV6qIZPkCvcCY7a8HQzl6RwJRz+6g8816KD26Kb3mSw1CpkpXn\n8dFasCousQKBgFdgZ2IbHVJtn1zV+QbUPYTrJ/RhaF/eZvGRprwAIwsHOxA8EG+o\nZF9SKBJACBU7CCtYNQaGhdLlsnNq/o9IkX4cM9Be0gRt+mliZOE0S8uM0suuHzUB\nTIpflsve8UveKRJRyngFvV6dnAFvnD3Sd02639Diixu2DjYyy1YfZQ61AoGATB2h\nsmYpEgNsYByp2XumpelTvmoKV/5T71+k6lPUQxJA5ZIW8Q/jE5g306Mex+mRqb06\nkX2P76A2ohQlXVP3IvltlWP5ZISn5VRhRobEZ9vlMLhflotS4bAAULoDiaAchgMe\neomYsixs3fBVqzAgXFyQjp/u5Depxac7IZS2ivECgYB+VyHnwqhWiXSxk6EfKTRE\n3i0t6bQbN0E368kjtVu1izqpIJd3xBbqrQpAwCfhDdsqxORKqYVzIOyC773EZ97M\nwOkjCaIfxJfciEygVr0iWGXhAbSTx0uaFIJQ40PSh+R5UXvz1aPMEzK3BdXN9mr6\nCuW/40CJQ72aoCOhzry3JQ==\n-----END PRIVATE KEY-----\n',
    sheet: '1BqeQNDuanaoHqufzwiUmho8zIugfkqK59EwMhGFvNhc',
    basePath: '../hce-rest-service'
  }, (err) => {
    if (err) console.dir(err);
    console.log('done.');
  });
