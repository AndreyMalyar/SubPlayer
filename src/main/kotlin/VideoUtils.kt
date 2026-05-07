package com.example

import java.io.File

fun getVideoDuration(file: File): Long {
    val process = ProcessBuilder(
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        file.absolutePath
    ).start()

    val output = process.inputStream.bufferedReader().readText().trim()
    return ((output.toDoubleOrNull() ?: 0.0) * 1000).toLong()
}