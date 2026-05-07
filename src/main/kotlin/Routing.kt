package com.example

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.http.content.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import java.io.File
import io.ktor.client.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.client.call.*
import io.ktor.client.statement.readRawBytes
import io.ktor.serialization.kotlinx.json.json
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.timeout

@Serializable
data class VideoItem(
    val name: String,
    val url: String,
    val duration: Long = 0,
    val hasSrt: Boolean = false,
    val hasRuSrt: Boolean = false,
    val hasRuMp3: Boolean = false,
)

@Serializable
data class DownLoadRequest(val url: String)

@Serializable
data class ApiResponse(val success: Boolean, val message: String)

@Serializable
data class TranslateFileRequest(val name: String)

@Serializable
data class TranslateResponse(val translatedText: String)

@Serializable
data class SubtitleEntry(val start: String, val end: String, val text: String)

@Serializable
data class TtsSyncedRequest(val subtitles: List<SubtitleEntry>, val voice: String )

fun Application.configureRouting() {
    routing {
        //статичные файлы фронтенда
        staticFiles("/", File("static"))

        //API - список видео
        get("/api/videos") {
            val videosDir = File("videos")
            val files = videosDir.listFiles()
                ?.filter { it.extension == "webm" || it.extension == "mp4" }
                ?.map {
                    val baseName = it.nameWithoutExtension
                    val hasSrt = File("videos/$baseName.srt").exists()
                    val hasRuSrt = File("videos/$baseName.ru.srt").exists()
                    val hasRuMp3 = File("videos/$baseName.ru.mp3").exists()
                    VideoItem(
                        it.name,
                        "/file/${it.name}",
                        getVideoDuration(it),
                        hasSrt = hasSrt,
                        hasRuSrt = hasRuSrt,
                        hasRuMp3 = hasRuMp3
                    )
                }
                ?: emptyList()
            call.respond(files)
        }


        //API - скачать видео
        post("/api/download") {
            val request = call.receive<DownLoadRequest>()
            // Пустой url
            if(request.url.isBlank()) {
                call.respond(HttpStatusCode.BadRequest, ApiResponse(false, "Ссылка не указана"))
                return@post
            }
            //Не ютубовская ссылка
            val isYoutube = request.url.contains("youtube.com/") || request.url.contains("youtu.be/")
            if(!isYoutube) {
                call.respond(HttpStatusCode.BadRequest, ApiResponse(false, "Ссылка должна быть с Youtube"))
                return@post
            }

            // чистим url от якоря
            val cleanUrl = request.url.substringBefore('#')

            call.response.header("Content-Type", "text/event-stream")
            call.response.header("Cache-Control", "no-cache")
            call.response.header("Connection", "keep-alive")

            call.respondTextWriter(contentType = ContentType.Text.EventStream) {
                val process = ProcessBuilder(
                    "yt-dlp", "--continue",
                    "--replace-in-metadata", "title", "#\\S*", "",
                    "-o", "videos/%(title)s.%(ext)s",
                    cleanUrl
                )
                    .redirectErrorStream(true)
                    .start()

                process.inputStream.bufferedReader().forEachLine { line ->
                    write("data: $line\n\n")
                    flush()
                }

                process.waitFor()
                write("data: DONE\n\n")
            }
        }
        //Отдаем файл видео
        get("/file/{name}") {
            val name = call.parameters["name"]
                ?: return@get call.respondText("Файл не найден")

            val file = File("videos/$name")
            if(!file.exists()) return@get call.respondText("Файл не найден")

            val rangeHeader = call.request.headers["Range"]
            val fileSize = file.length()

            if(rangeHeader == null) {
                call.response.header("Accept-Ranges", "bytes")
                call.respondFile(file)
                return@get
            }
            //парсим Range: bytes=start-end
            val range = rangeHeader.removePrefix("bytes=").split("-")
            val start = range[0].toLongOrNull() ?: 0
            val end = range.getOrNull(1)?.toLongOrNull() ?: (fileSize - 1)
            val length = end - start + 1

            call.response.status(HttpStatusCode.PartialContent)
            call.response.header("Content-Range", "bytes $start-$end/$fileSize")
            call.response.header("Accept-Ranges", "bytes")
            call.response.header("Content-Length", length.toString())

            call.respondBytes(
                contentType = ContentType.Video.Any,
                status = HttpStatusCode.PartialContent
            ) {
                file.inputStream().use { stream ->
                    stream.skip(start)
                    stream.readNBytes(length.toInt())
                }
            }

        }
        // API - удалить видео
        delete("api/videos/{name}") {
            val name = call.parameters["name"]
                ?: return@delete call.respond(ApiResponse(false, "Имя файла не указано"))
            val file = File("videos/$name")
            if(!file.exists()) {
                return@delete call.respond(ApiResponse(false, "Файл не найден"))
            }

            // Защита от path traversal: файл должен быть внутри папки videos
            val videoDir = File("videos").canonicalFile
            if(!file.canonicalFile.startsWith(videoDir)) {
                return@delete call.respond(HttpStatusCode.Forbidden, ApiResponse(false, "Доступ запрещен"))
            }

            val deleted = file.delete()
            if(deleted) {
                // удаляем субтитры и mp3 если есть
                val baseName = file.nameWithoutExtension
                File("videos/$baseName.srt").takeIf { it.exists() }?.delete()
                File("videos/$baseName.ru.srt").takeIf { it.exists() }?.delete()
                File("videos/$baseName.ru.mp3").takeIf { it.exists() }?.delete()

                call.respond(ApiResponse(true, "Видео удалено"))
            } else {
                call.respond(ApiResponse(false, "Не удалось удалить файл"))
            }
        }

        // API - генерация субтитров
        post("/api/subtitles") {
            val request = call.receive<VideoItem>()
            val videoFile = File("videos/${request.name}")
            val srtFile = File("videos/${request.name.substringBeforeLast('.')}.srt")

            // если субтитры уже есть - не генерируем заново
            if(srtFile.exists()) {
                call.respond(ApiResponse(true, "Субтитры уже существуют"))
                return@post
            }

            if(!videoFile.exists()) {
                call.respond(ApiResponse(false, "Файл не найден"))
                return@post
            }

            call.response.header("Content-Type", "text/event-stream")
            call.response.header("Cache-Control", "no-cache")
            call.response.header("Connection", "keep-alive")

            call.respondTextWriter(contentType = ContentType.Text.EventStream) {
                val process = ProcessBuilder(
                    ".\\whisper\\Faster-Whisper-XXL\\faster-whisper-xxl.exe",
                    "videos\\${request.name}",
                    "--language", "en",
                    "--output_dir", "videos"
                )
                    .redirectErrorStream(true)
                    .start()

                process.inputStream.bufferedReader().forEachLine { line ->
                    write("data: $line\n\n")
                    flush()
                }

                process.waitFor()
                write("data: DONE\n\n")
                flush()
            }
        }

        // отдаем файл .srt субтитры
        get("/api/subtitles-file/{name}") {
            val name = call.parameters["name"] ?: return@get call.respondText("Файл не найден")
            val file = File("videos/$name")
            if(!file.exists()) return@get call.respondText("Файл не найден")
            call.respondFile(file)
        }

        // перевод субтитров
        post("/api/translate") {
            val request = call.receive<TranslateFileRequest>()
            val baseName = request.name.substringBeforeLast('.')
            val srtFile = File("videos/$baseName.srt")
            val ruSrtFile = File("videos/$baseName.ru.srt")

            if(ruSrtFile.exists()) {
                call.respond(ApiResponse(true, "Перевод уже существует"))
                return@post
            }

            call.response.header("Content-Type", "text/event-stream")
            call.response.header("Cache-Control", "no-cache")
            call.response.header("Connection", "keep-alive")

            call.respondTextWriter(contentType = ContentType.Text.EventStream) {
                val client = HttpClient(CIO) {
                    install(io.ktor.client.plugins.contentnegotiation.ContentNegotiation) {
                        json()
                    }
                }
                try {
                    val lines = srtFile.readLines()
                    val result = mutableListOf<String>()
                    var i = 0

                    // считаем и отправляем total
                    val totalLines = lines.count {
                        it.isNotBlank() && !it.matches(Regex("\\d+")) && !it.contains("-->")
                    }
                    write("data: TOTAL:$totalLines\n\n")
                    flush()

                    while(i < lines.size) {
                        val line = lines[i]
                        // текстовые строки -> не номер и не таймкод
                        if(line.isNotBlank() && !line.matches(Regex("\\d+")) && !line.contains("-->")) {
                            val response = client.post("http://localhost:5000/translate") {
                                contentType(ContentType.Application.Json)
                                setBody(mapOf(
                                    "q" to line,
                                    "source" to "en",
                                    "target" to "ru",
                                    "format" to "text",
                                    "api_key" to ""
                                ))
                            }
                            val translated = response.body<TranslateResponse>().translatedText
                            result.add(translated)
                            write("data: $translated\n\n")
                            flush()
                        } else {
                            result.add(line)
                        }
                        i++
                    }

                    // атомарно сохраняем только когда все готово
                    ruSrtFile.writeText(result.joinToString("\n"))
                    write("data: DONE\n\n")
                    flush()
                } catch (e: Exception) {
                    write("data: ERROR: ${e.message}\n\n")
                    flush()
                } finally {
                    client.close()
                }
            }
        }

        // удалить субтитры
        delete("/api/subtitles/{name}") {
            val name = call.parameters["name"]
                ?: return@delete call.respond(ApiResponse(false, "Имя файла не указано"))
            val baseName = name.substringBeforeLast('.')

            File("videos/$baseName.srt").takeIf { it.exists() }?.delete()
            File("videos/$baseName.ru.srt").takeIf { it.exists() }?.delete()
            File("videos/$baseName.ru.mp3").takeIf { it.exists() }?.delete()

            call.respond(ApiResponse(true, "Субтитры удалены"))
        }

        // POST /api/tts - генерируем .mp3
        post("/api/tts") {
            val request = call.receive<TranslateFileRequest>()
            val baseName = request.name.substringBeforeLast('.')
            val ruSrtFile = File("videos/$baseName.ru.srt")
            val mp3File = File("videos/$baseName.ru.mp3")

            println("=== TTS START: $baseName ===")

            if (mp3File.exists()) {
                call.respond(ApiResponse(true, "Аудио уже существует"))
                return@post
            }

            if (!ruSrtFile.exists()) {
                call.respond(ApiResponse(false, "Файл субтитров не найден"))
                return@post
            }

            fun parseSrt(file: File): List<SubtitleEntry> {
                val entries = mutableListOf<SubtitleEntry>()
                val lines = file.readLines()
                var i = 0
                while (i < lines.size) {
                    if (lines[i].matches(Regex("\\d+"))) {
                        val timeLine = lines[i + 1]
                        val (start, end) = timeLine.split(" --> ")
                        val text = lines[i + 2]
                        entries.add(SubtitleEntry(start.trim(), end.trim(), text.trim()))
                        i += 4
                    } else i++
                }
                return entries
            }

            val subtitles = parseSrt(ruSrtFile)
            val total = subtitles.size
            println("Parsed subtitles: $total")

            val tempDir = File("videos/tts_tmp_$baseName").also { it.mkdirs() }

            call.response.header("Content-Type", "text/event-stream")
            call.response.header("Cache-Control", "no-cache")
            call.response.header("Connection", "keep-alive")

            call.respondTextWriter(contentType = ContentType.Text.EventStream) {
                val client = HttpClient(CIO) {
                    install(io.ktor.client.plugins.contentnegotiation.ContentNegotiation) { json() }
                    install(HttpTimeout) {
                        requestTimeoutMillis = 120_000  // 2 минуты
                        connectTimeoutMillis = 10_000
                        socketTimeoutMillis = 120_000
                    }
                }

                try {
                    write("data: TOTAL:$total\n\n")
                    flush()

                    // Отправляем по одному субтитру
                    subtitles.forEachIndexed { index, subtitle ->
                        val chunkFile = File(tempDir, "chunk_${String.format("%04d", index)}.mp3")

                        val response = client.post("http://localhost:5001/tts-synced") {
                            contentType(ContentType.Application.Json)
                            setBody(TtsSyncedRequest(
                                subtitles = listOf(subtitle), // ← один субтитр
                                voice = "ru-RU-SvetlanaNeural"
                            ))
                        }
                        chunkFile.writeBytes(response.readRawBytes())

                        write("data: ${index + 1}/$total\n\n")
                        flush()
                    }

                    // Склеиваем через ffmpeg
                    val listFile = File(tempDir, "list.txt")
                    listFile.writeText(
                        (0 until total).joinToString("\n") {
                            // ← заменить обратные слэши на прямые
                            "file '${tempDir.absolutePath.replace("\\", "/")}/chunk_${String.format("%04d", it)}.mp3'"
                        }
                    )

                    println("Merging $total chunks...")
                    val process = ProcessBuilder(
                        "cmd", "/c", "ffmpeg", "-y",
                        "-f", "concat", "-safe", "0",
                        "-i", listFile.absolutePath,
                        "-c", "copy",
                        mp3File.absolutePath
                    ).redirectErrorStream(true).also {
                        it.redirectOutput(ProcessBuilder.Redirect.INHERIT) // ← логи ffmpeg в консоль
                    }.start()
                    val exitCode = process.waitFor()
                    println("MP3 saved: ${mp3File.absolutePath}")
                    println("FFmpeg exit code: $exitCode")

                    // Чистим временные файлы
                    tempDir.deleteRecursively()

                    write("data: DONE\n\n")
                    flush()

                } catch (e: Exception) {
                    println("ERROR: ${e.message}")
                    write("data: ERROR: ${e.message}\n\n")
                    flush()
                    tempDir.deleteRecursively()
                } finally {
                    client.close()
                }
            }
        }

        // GET /api/tts-file/:name
        get("/api/tts-file/{name}") {
            val name = call.parameters["name"]
                ?: return@get call.respondText("Файл не найден")
            val file = File("videos/$name")
            if (!file.exists()) return@get call.respondText("Файл не найден")

            val rangeHeader = call.request.headers["Range"]
            val fileSize = file.length()

            if(rangeHeader == null) {
                call.response.header("Accept-Ranges", "bytes")
                call.response.header("Content-Type", "audio/mpeg")
                call.respondFile(file)
                return@get
            }

            val range = rangeHeader.removePrefix("bytes=").split("-")
            val start = range[0].toLongOrNull() ?: 0
            val end = range.getOrNull(1)?.toLongOrNull() ?: (fileSize - 1)
            val length = end - start + 1

            call.response.status(HttpStatusCode.PartialContent)
            call.response.header("Content-Range", "bytes $start-$end/$fileSize")
            call.response.header("Accept-Ranges", "bytes")
            call.response.header("Content-Length", length.toString())
            call.response.header("Content-Type", "audio/mpeg")

            call.respondBytes(
                contentType = ContentType.parse("audio/mpeg"),
                status = HttpStatusCode.PartialContent
            ) {
                file.inputStream().use { stream ->
                    stream.skip(start)
                    stream.readNBytes(length.toInt())
                }
            }
        }

    }
}

/*
Важный момент — path traversal защита.
Без неё запрос типа DELETE /api/videos/../../важный-файл
мог бы удалить что угодно на сервере.
canonicalFile.startsWith(videosDir) это исключает.
*/