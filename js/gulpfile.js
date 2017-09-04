const gulp = require('gulp'),
      sass = require('gulp-sass'),
      autoprefixer = require('gulp-autoprefixer'),
      browserSync = require('browser-sync').create();

gulp.task('sass', ()=>{
    gulp.src('../scss/*.scss')
        .pipe(sass({
            outputStyle: 'expanded'
        }).on('error',sass.logError ))
        .pipe(autoprefixer({
            versions: ['last 2 browsers']
        }))
        .pipe(gulp.dest('../css'));
});

gulp.task('default',()=>{
    browserSync.init({
        server: '../'
    });
    gulp.watch('../*.html').on('change',browserSync.reload);
    gulp.watch('../css/*.css').on('change',browserSync.reload);
    gulp.watch('../js/*.js').on('change',browserSync.reload);
    gulp.watch('../scss/*.scss', ['sass']);
})