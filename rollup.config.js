import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'cjs',
    sourcemap: true,
  },
  plugins: [
    typescript({ declaration: true, outDir: 'dist', rootDir: 'src' }),
    commonjs(),
    terser(), // Minifies the bundle
  ],
  preserveModules: true,
};
