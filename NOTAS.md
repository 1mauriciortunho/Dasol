# Notas técnicas del repo

Apuntes de cosas que hay que reaplicar a mano cuando se regenera algo
(node_modules, carpeta `android/` por prebuild, etc.). No es código de la app.

## Parche: foojay-resolver-convention a 1.0.0 (build de Android con Gradle 9)

**Síntoma:** la compilación de Android con Gradle 9.x falla con:

```
Class org.gradle.jvm.toolchain.JvmVendorSpec does not have member field
'org.gradle.jvm.toolchain.JvmVendorSpec IBM_SEMERU'
```

**Causa:** el plugin `org.gradle.toolchains.foojay-resolver-convention` viene
fijado en `0.5.0` dentro del gradle-plugin de React Native, que entra al build
como *composite build* (`includeBuild`). Esa versión referencia la constante
`IBM_SEMERU`, removida en Gradle 9. La solución es subir el plugin a `1.0.0`.

**Dónde está (ojo, NO es `android/settings.gradle`):**

`node_modules/@react-native/gradle-plugin/settings.gradle.kts`, línea 16.

```diff
- plugins { id("org.gradle.toolchains.foojay-resolver-convention").version("0.5.0") }
+ plugins { id("org.gradle.toolchains.foojay-resolver-convention").version("1.0.0") }
```

**Automatizado con `patch-package`:** el cambio vive en
`patches/@react-native+gradle-plugin+0.85.3.patch` y el script
`"postinstall": "patch-package"` lo reaplica solo después de cada
`npm install`. No hace falta tocar `node_modules/` a mano.

**Si se actualiza React Native:** el nombre del `.patch` lleva la versión del
gradle-plugin. Al subir de versión, comprobar si la nueva ya trae foojay
`>= 1.0.0`; si sí, borrar el `.patch`; si no, rehacer el cambio en
`node_modules/` y regenerarlo con `npx patch-package @react-native/gradle-plugin`
(revisar que el `.patch` solo contenga `settings.gradle.kts` y no archivos de
`.gradle/` o `build/`).
