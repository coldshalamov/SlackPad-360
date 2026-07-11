# Note on js-toolchain-smoke.log field viteResolved

The historical Node smoke log includes `"viteResolved": true`. That field only
meant `require.resolve('vite')` succeeded in the disposable package graph.

It is **not** evidence that Vite can production-bundle Three + Rapier.

Authoritative Vite build proof: `vite-build-smoke.md` + `vite-build-smoke.log`
(exit 0, dist inventory).
