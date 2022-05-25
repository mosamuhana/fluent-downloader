import typescript from '@rollup/plugin-typescript';
import cleanup from 'rollup-plugin-cleanup';
import dts from "rollup-plugin-dts";
import banner from "rollup-plugin-banner";

import pkg from "./package.json";

const licensePiece = `${pkg.name}
${pkg.description}
Version: ${pkg.version}
Author: ${pkg.author}
License: ${pkg.license}
Homepage: ${pkg.homepage}`;

const name = 'index';

export default [
	{
		external: [],
		input: `src/${name}.ts`,
		output: [
			{
				file: `dist/${name}.mjs`,
				format: "es",
				sourcemap: false,
			},
			{
				file: `dist/${name}.js`,
				format: "cjs",
				sourcemap: false,
			},
		],
		plugins: [
			typescript({
				module: 'esnext',
				sourceMap: false,
				inlineSources: false,
			}),
			cleanup({
				comments: false,
				sourcemap: false,
				compactComments: true,
				maxEmptyLines: -1,
			}),
			banner(licensePiece),
		]
	},
	{
		input: `src/${name}.ts`,
		output: [
			{
				file: `dist/${name}.d.ts`,
				format: "es",
				sourcemap: false,
			}
		],
		plugins: [
			dts(),
			banner(licensePiece),
		],
	}
];
