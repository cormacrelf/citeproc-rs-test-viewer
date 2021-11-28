const esbuild = require('esbuild');

const define = {}
for (const k in process.env) {
    if (k === "PUBLIC_URL") {
        define[`process.env.${k}`] = JSON.stringify(process.env[k]);
    }
}
console.log("PUBLIC_URL", define['process.env.PUBLIC_URL'])

const buildOptions = {
    entryPoints: ['src/index.tsx'],
    outdir: "./build",
    bundle: true,
    minify: true,
    sourcemap: true,
    define,
};

if (require.main === module) {
    esbuild.buildSync(buildOptions);
}

module.exports = buildOptions;

