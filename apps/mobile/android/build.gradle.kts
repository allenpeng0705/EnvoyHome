import com.android.build.gradle.BaseExtension

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}

// Do not use evaluationDependsOn(":app") together with afterEvaluate — it marks
// plugin projects evaluated too early and blocks compileSdk overrides.
//
// file_picker 8.x still declares compileSdk 34 while
// flutter_plugin_android_lifecycle requires API 36+.
subprojects {
    afterEvaluate {
        extensions.findByType<BaseExtension>()?.apply {
            val current =
                runCatching {
                    compileSdkVersion?.removePrefix("android-")?.toIntOrNull()
                }.getOrNull() ?: 0
            if (current < 36) {
                compileSdkVersion(36)
            }
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
