const esbuild = require('esbuild');

const define = {}
for (const k in process.env) {
    if (k === "PUBLIC_URL") {
    }
}

function getEnv(name) {
    define[`process.env.${name}`] = JSON.stringify(process.env[name] || "");
    console.log(name, define['process.env.' + name])
}

getEnv("PUBLIC_URL");
getEnv("HOSTED_SNAPSHOT");

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

