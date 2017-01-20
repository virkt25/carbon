'use strict';

//////////////////////////////
// Requires
//////////////////////////////

const fs = require('fs');
const scssToJson = require('scss-to-json');
const path = require('path');
const autoprefixer = require('gulp-autoprefixer');
const browserSync = require('browser-sync').create();
const del = require('del');
const gulp = require('gulp');
const rename = require('gulp-rename');
const sass = require('gulp-sass');
const sassLint = require('gulp-sass-lint');
const eslint = require('gulp-eslint');
const sourcemaps = require('gulp-sourcemaps');
const jsdoc = require('gulp-jsdoc3');

const webpack = require('webpack');
const babel = require('gulp-babel');
const merge = require('merge-stream');
const gutil = require('gulp-util');

const Server = require('karma').Server;
const cloptions = require('minimist')(process.argv.slice(2), {
  alias: {
    k: 'keepalive',
  },
  boolean: ['keepalive'],
});

//////////////////////////////
// BrowserSync
//////////////////////////////

gulp.task('browser-sync', () => {
  browserSync.init({
    logPrefix: 'Bluemix Components',
    open: false,
    proxy: 'localhost:8080',
    timestamps: false,
  });
});

//////////////////////////////
// Clean
//////////////////////////////

// Use: npm run prebuild
gulp.task('clean', () => {
  return del([
    'dist',
    'demo/**/*.{js,map}',
    '!demo/js/demo-switcher.js',
    '!demo/js/theme-switcher.js',
    '!demo/index.js',
    '!demo/polyfills/*.js',
  ]);
});

//////////////////////////////
// JavaScript Tasks
//////////////////////////////

function buildScripts(options) {
  options = options || {};
  options.target = (options.target || './dist/bluemix-components.js')
    .replace(/\.js$/, options.prod ? '.min.js' : '.js');
  return new Promise((resolve, reject) => {
    webpack({
      devtool: 'source-maps',
      entry: options.entry || './index.js',
      output: Object.assign({
        path: path.dirname(options.target),
        filename: path.basename(options.target),
      }, options.noExport ? {} : {
        libraryTarget: 'var',
        library: 'BluemixComponents',
      }),
      module: {
        loaders: [
          {
            test: /\.js?$/,
            exclude: /node_modules/,
            loaders: ['babel'],
          },
        ],
      },
      plugins: options.prod ? [new webpack.optimize.UglifyJsPlugin()] : [],
    }, (err, stats) => {
      if (err) {
        reject(new gutil.PluginError('webpack', err));
      } else {
        gutil.log('[webpack]', stats.toString({
          progress: true,
          colors: true,
        }));
        resolve();
      }
    });
  });
}


gulp.task('scripts:umd', () => {
  const filesMain = './src/components/**/*.js';
  const filesOthers = './src/globals/js/**/*.js';

  const babelOpts = {
    plugins: ['transform-es2015-modules-umd', 'transform-runtime'],
  };

  const mainStream = gulp.src(filesMain)
    .pipe(babel(babelOpts))
    .pipe(gulp.dest('./dist/js/umd/lib'));

  const othersStream = gulp.src(filesOthers)
    .pipe(babel(babelOpts))
    .pipe(gulp.dest('./dist/js/umd'));

  return merge(mainStream, othersStream);
});

gulp.task('scripts:consumables', () => {
  return Promise.all([
    buildScripts(), // Expanded ES5
    buildScripts({ prod: true }), // Minified ES5
  ]);
});

gulp.task('scripts:dev', () => {
  return Promise.all([
    buildScripts({
      target: './demo/demo.js',
      entry: './demo/index.js',
    }),
  ]);
});

//////////////////////////////
// Sass Tasks
//////////////////////////////

gulp.task('sass:consumables', () => {
  function buildStyles(prod) {
    return gulp.src('src/globals/scss/styles.scss')
      .pipe(sourcemaps.init())
      .pipe(sass({
        outputStyle: prod ? 'compressed' : 'expanded',
      }).on('error', sass.logError))
      .pipe(autoprefixer({
        browsers: ['> 1%', 'last 2 versions'],
      }))
      .pipe(rename(function (path) {
        if (path.basename === 'styles') {
          path.basename = 'bluemix-components';
        }
        if (prod) {
          path.extname = '.min' + path.extname;
        }
      }))
      .pipe(sourcemaps.write())
      .pipe(gulp.dest('dist'))
      .pipe(browserSync.stream());
  }

  buildStyles(); // Expanded CSS
  buildStyles(true); // Minified CSS
});

gulp.task('sass:dev', () => {
  return gulp.src('demo/**/demo.scss')
    .pipe(sourcemaps.init())
    .pipe(sass({
      outputStyle: 'expanded',
    }).on('error', sass.logError))
    .pipe(autoprefixer({
      browsers: ['> 1%', 'last 2 versions'],
    }))
    .pipe(rename({ dirname: '' }))
    .pipe(sourcemaps.write())
    .pipe(gulp.dest('demo'))
    .pipe(browserSync.stream());
});

/////////////////////////////
// Lint
/////////////////////////////

gulp.task('lint', function () {
  return gulp.src([
    'src/**/*.js'
  ])
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failAfterError())
    .pipe(eslint.results(function(results) {
      let count = results.warningCount;
      if (count > 0) {
        throw new gutil.PluginError('gulp-eslint', {
          name: 'ESLintWarning',
          message: 'Has ' + count + ' warning' + (count > 1 ? 's' : ''),
        });
      }
    }));
});

/////////////////////////////
// Test
/////////////////////////////

gulp.task('test', (done) => {
  new Server({
    configFile: path.resolve(__dirname, 'tests/karma.conf.js'),
    singleRun: !cloptions.keepalive,
  }, done).start();
});

/////////////////////////////
// JSDoc
/////////////////////////////

gulp.task('jsdoc', function (cb) {
  gulp.src('./src/components/**/*.js')
    .pipe(babel({
      plugins: ['transform-class-properties'],
      babelrc: false,
    }))
    .pipe(gulp.dest('./docs/js/tmp'))
    .on('end', () => {
      gulp.src(['README.md', 'docs/js/tmp/**/*.js'], {read: false})
        .pipe(jsdoc(Object.assign(require('gulp-jsdoc3/dist/jsdocConfig.json'), {
          opts: {
            destination: './docs/js'
          },
        }), (err) => {
          if (err) {
            cb(err);
          } else {
            del('./docs/js/tmp', cb);
          }
        }));
    })
    .on('error', cb);
});

//////////////////////////////
// Running Tasks
//////////////////////////////

gulp.task('watch', () => {
  gulp.watch('src/**/**/*.html').on('change', browserSync.reload);
  gulp.watch(['src/**/**/*.js'], ['scripts:dev']);
  gulp.watch(['src/**/**/*.scss', 'demo/**/*.scss'], ['sass:dev']);
});

gulp.task('serve', ['browser-sync', 'watch']);

// Use: npm run build
gulp.task('build', ['sass:consumables', 'scripts:consumables']);
gulp.task('build:dev', ['sass:dev', 'scripts:dev']);

gulp.task('default', () => {
  console.log('\n\n Please use `$ npm run dev` and navigate to \n http://localhost:3000 to view project locally \n\n');
});
