import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  AudioLines,
  Check,
  ChevronRight,
  FileAudio,
  FileText,
  Film,
  LockKeyhole,
  Music2,
  RotateCcw,
  Sparkles,
  Upload,
} from 'lucide-react'
import { BlinkClientBoundary } from '@/components/BlinkClientBoundary'
import { blink } from '@/blink/client'

type Cue = { start: number; end: number; text: string }
type TranscriptSegment = { start: number; end: number; text: string }
type TranscriptResult = { text?: string; segments?: TranscriptSegment[] }

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Subsync — Subtitle timing, fixed' },
      { name: 'description', content: 'Automatically align subtitle timing to your audio.' },
    ],
  }),
  component: Home,
})

function Home() {
  return (
    <BlinkClientBoundary fallback={<LoadingScreen />}>
      <SubsyncWorkspace />
    </BlinkClientBoundary>
  )
}

function LoadingScreen() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background text-muted-foreground">
      <div className="flex items-center gap-3 text-sm"><span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> Opening your studio…</div>
    </main>
  )
}

function SubsyncWorkspace() {
  const [user, setUser] = useState<unknown>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null)
  const [cues, setCues] = useState<Cue[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [done, setDone] = useState(false)
  const audioInput = useRef<HTMLInputElement>(null)
  const subtitleInput = useRef<HTMLInputElement>(null)

  useEffect(() => blink.auth.onAuthStateChanged((state) => {
    setUser(state.user)
    if (!state.isLoading) setAuthLoading(false)
  }), [])

  const login = () => blink.auth.login(window.location.href)
  const parseSubtitle = async (file: File) => {
    const parsed = parseSubtitleText(await file.text())
    if (!parsed.length) {
      setNotice('We couldn’t find any subtitle cues in that file. Choose a valid SRT or VTT file.')
      return
    }
    setSubtitleFile(file)
    setCues(parsed)
    setDone(false)
    setNotice(`${parsed.length} subtitle cues ready to sync.`)
  }

  const handleMediaFile = (file: File) => {
    if (!isVideoFile(file) && !isSupportedAudioFile(file)) {
      setNotice('This audio format isn’t supported. Choose MP3, WAV, M4A, FLAC, OGG, or WebM audio.')
      if (audioInput.current) audioInput.current.value = ''
      return
    }
    setAudioFile(file)
    setDone(false)
    setNotice('Media is ready. Add your subtitle file to continue.')
  }

  const syncSubtitles = async () => {
    if (!audioFile || !subtitleFile) return
    if (!user) {
      setNotice('Sign in to run secure audio transcription, then your files stay in this browser.')
      login()
      return
    }
    setBusy(true)
    setNotice('Listening to your audio and finding each line…')
    try {
      const response = await blink.ai.transcribeAudio({
        audio: isVideoFile(audioFile) ? await extractVideoAudio(audioFile) : await fileToDataUrl(audioFile),
        response_format: 'verbose_json',
      })
      const transcript = response as unknown as TranscriptResult
      if (!transcript.segments?.length) throw new Error('The transcription service returned no timestamped speech. Try a clearer audio file.')
      const aligned = alignCues(cues, transcript.segments)
      setCues(aligned)
      setDone(true)
      setNotice(`Synced ${aligned.length} subtitle cues against the spoken audio.`)
    } catch (error) {
      setNotice(getTranscriptionErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const downloadSrt = () => {
    const contents = cues.map((cue, index) => `${index + 1}\n${formatTime(cue.start)} --> ${formatTime(cue.end)}\n${cue.text}`).join('\n\n')
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${(audioFile?.name || 'subtitles').replace(/\.[^.]+$/, '')}-synced.srt`
    link.click()
    URL.revokeObjectURL(url)
  }

  const updateCueText = (index: number, text: string) => setCues((current) => current.map((cue, i) => i === index ? { ...cue, text } : cue))
  const clearSession = () => {
    setAudioFile(null)
    setSubtitleFile(null)
    setCues([])
    setDone(false)
    setNotice('')
    if (audioInput.current) audioInput.current.value = ''
    if (subtitleInput.current) subtitleInput.current.value = ''
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border/80">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <a href="/" aria-label="Subsync home" className="flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_5px_20px_-8px_var(--primary)]"><AudioLines size={20} strokeWidth={2.4} /></span>
            <span className="text-[17px] font-bold tracking-tight">subsync<span className="text-primary">.</span></span>
          </a>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Files stay in your session</span>
            {user ? (
              <button onClick={() => blink.auth.logout()} className="rounded-lg border border-border px-3.5 py-2 text-xs font-semibold text-foreground transition hover:bg-accent active:scale-[0.98]">Sign out</button>
            ) : (
              <button onClick={login} className="rounded-lg px-3.5 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground">Sign in</button>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <div className="mb-9 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <div className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-primary"><Sparkles size={13} /> Subtitle studio <span className="h-px w-9 bg-primary/50" /></div>
            <h1 className="font-serif text-4xl font-medium leading-[1.08] tracking-[-0.035em] sm:text-[52px]">Make every line<br className="hidden sm:block" /> land on time.</h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground sm:text-[15px]">Drop in your audio and subtitles. Subsync listens, finds the spoken words, and brings your captions back into sync.</p>
          </div>
          <div className="flex items-center gap-2 self-start rounded-full border border-border/80 bg-card/70 px-3.5 py-2 text-xs text-muted-foreground md:self-auto"><LockKeyhole size={13} className="text-primary" /> Private, in-session workflow</div>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
          <div className="space-y-4">
            <FileDropCard
              label="01 · Your media"
              title={audioFile?.name ?? 'Choose audio or video'}
              detail={audioFile ? `${formatBytes(audioFile.size)} · ${isVideoFile(audioFile) ? 'Audio track will be extracted' : 'Ready for transcription'}` : 'Audio: MP3, WAV, M4A · Video: MP4, MOV, WebM'}
              icon={audioFile && isVideoFile(audioFile) ? <Film size={19} /> : <FileAudio size={19} />}
              selected={!!audioFile}
              inputRef={audioInput}
              accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/flac,audio/ogg,audio/webm,video/mp4,video/webm,video/quicktime,.mp3,.wav,.m4a,.flac,.ogg,.webm,.mp4,.mov"
              onFile={handleMediaFile}
            />
            <FileDropCard
              label="02 · Your subtitles"
              title={subtitleFile?.name ?? 'Choose a subtitle file'}
              detail={subtitleFile ? `${cues.length} cues · ${formatBytes(subtitleFile.size)}` : 'SRT or WebVTT · Existing text is preserved'}
              icon={<FileText size={19} />}
              selected={!!subtitleFile}
              inputRef={subtitleInput}
              accept=".srt,.vtt,text/vtt,application/x-subrip"
              onFile={(file) => { void parseSubtitle(file) }}
            />

            {audioFile && <MediaPreview key={`${audioFile.name}-${audioFile.lastModified}`} file={audioFile} />}

            <div className="rounded-2xl border border-primary/20 bg-primary/[0.055] p-4 sm:p-5">
              <div className="flex gap-3"><span className="mt-0.5 text-primary"><Sparkles size={17} /></span><div><h2 className="text-sm font-semibold">Timing that follows the speech</h2><p className="mt-1.5 text-xs leading-5 text-muted-foreground">Subsync compares your caption text with timestamped speech, then adjusts cue timing without rewriting your lines.</p></div></div>
            </div>
          </div>

          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_60px_-40px_oklch(0_0_0/0.8)]" aria-label="Subtitle timing workspace">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
              <div><div className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Timing workspace</div><div className="mt-1 text-sm font-semibold">{cues.length ? `${cues.length} subtitle cues` : 'Your subtitles, in sync'}</div></div>
              {cues.length > 0 && <button onClick={clearSession} aria-label="Clear current files" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"><RotateCcw size={15} /></button>}
            </div>

            {cues.length === 0 ? (
              <div className="flex min-h-[390px] flex-col items-center justify-center px-6 py-12 text-center">
                <div className="relative mb-6 grid h-[76px] w-[76px] place-items-center rounded-[24px] border border-border bg-background text-primary shadow-inner">
                  <CaptionsIcon />
                  <span className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full border-4 border-card bg-primary text-primary-foreground"><ChevronRight size={13} /></span>
                </div>
                <h2 className="font-serif text-[23px] font-medium tracking-tight">The edit starts here</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Add both files to see your cue list and align its timing with the audio.</p>
                <button onClick={() => subtitleInput.current?.click()} className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-xs font-semibold transition hover:border-primary/50 hover:bg-accent active:scale-[0.98]"><Upload size={14} /> Browse subtitle file</button>
                <div className="mt-8 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/80"><span>Audio</span><span className="h-px w-7 bg-border" /><span>Transcript</span><span className="h-px w-7 bg-border" /><span>Synced</span></div>
              </div>
            ) : (
              <div className="animate-fade-in">
                <div className="flex items-center justify-between border-b border-border/80 bg-background/50 px-5 py-3 text-[11px] text-muted-foreground sm:px-6">
                  <span>CAPTIONS <span className="ml-1 text-foreground">{cues.length.toString().padStart(2, '0')}</span></span>
                  <span className="flex items-center gap-1.5">{done ? <><Check size={13} className="text-emerald-400" /> Timing aligned</> : 'Text is editable'}</span>
                </div>
                <div className="max-h-[420px] divide-y divide-border/70 overflow-y-auto">
                  {cues.map((cue, index) => <CueRow key={`${index}-${cue.start}`} cue={cue} index={index} onTextChange={updateCueText} />)}
                </div>
                <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <p className="text-xs leading-5 text-muted-foreground">{done ? 'Review the lines, then export your synced SRT.' : 'Your subtitle text stays as-is; only timing is adjusted.'}</p>
                  {done && <button onClick={downloadSrt} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-xs font-semibold transition hover:bg-accent active:scale-[0.98]"><ArrowDownToLine size={15} /> Export SRT</button>}
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="mx-auto mt-6 max-w-7xl">
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><AudioLines size={17} /></span>
              <div className="min-w-0"><div className="text-sm font-semibold">{busy ? 'Listening closely…' : 'Ready when you are'}</div><div role="status" aria-live="polite" className="mt-0.5 truncate text-xs text-muted-foreground">{notice || (authLoading ? 'Checking sign-in…' : user ? 'Choose your files to begin.' : 'Sign in is required to transcribe audio.')}</div></div>
            </div>
            <button onClick={syncSubtitles} disabled={busy || !audioFile || !subtitleFile || authLoading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[0_8px_26px_-12px_var(--primary)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" /> Syncing…</> : done ? <><Check size={16} /> Sync again</> : <><Sparkles size={15} />{user ? 'Sync subtitles' : 'Sign in & sync'}</>}
            </button>
          </div>
          <p className="mt-3 text-center text-[11px] leading-5 text-muted-foreground/80">Audio is sent securely for transcription. Your files and edits aren’t saved to an account.</p>
        </div>
      </section>
      <footer className="border-t border-border/70 px-5 py-5 text-center text-[11px] text-muted-foreground/70">Subsync <span className="mx-2">·</span> a calmer way to get the timing right</footer>
    </main>
  )
}

function FileDropCard({ label, title, detail, icon, selected, inputRef, accept, onFile }: {
  label: string; title: string; detail: string; icon: React.ReactNode; selected: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>; accept: string; onFile: (file: File) => void
}) {
  const [dragging, setDragging] = useState(false)
  return (
    <div onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) onFile(file) }} className={`group rounded-2xl border bg-card p-4 transition duration-200 sm:p-5 ${dragging ? 'border-primary bg-primary/[0.06]' : selected ? 'border-primary/40' : 'border-border hover:border-muted-foreground/40'}`}>
      <div className="mb-4 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.17em] text-muted-foreground">{label}</span>{selected && <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400"><Check size={12} /> Added</span>}</div>
      <div className="flex items-center gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${selected ? 'border-primary/25 bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground group-hover:text-primary'}`}>{icon}</span>
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{title}</div><div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div></div>
        <input ref={inputRef} type="file" accept={accept} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file) }} />
        <button onClick={() => inputRef.current?.click()} className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-accent active:scale-[0.97]">{selected ? 'Replace' : 'Browse'}</button>
      </div>
      {!selected && <p className="mt-4 border-t border-border/70 pt-3 text-[11px] text-muted-foreground/80">or drop your file here</p>}
    </div>
  )
}

function CueRow({ cue, index, onTextChange }: { cue: Cue; index: number; onTextChange: (index: number, text: string) => void }) {
  return (
    <div className="grid grid-cols-[52px_1fr] gap-3 px-5 py-4 transition hover:bg-accent/30 sm:grid-cols-[64px_105px_1fr] sm:gap-4 sm:px-6">
      <span className="pt-1 font-mono text-[10px] text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
      <span className="col-start-2 row-start-1 font-mono text-[10px] leading-5 text-primary sm:col-start-2">{formatTime(cue.start).slice(3, 8)} <span className="text-muted-foreground">→</span> {formatTime(cue.end).slice(3, 8)}</span>
      <textarea aria-label={`Subtitle cue ${index + 1}`} value={cue.text} onChange={(event) => onTextChange(index, event.target.value)} rows={Math.min(3, Math.max(1, Math.ceil(cue.text.length / 64)))} className="col-span-2 col-start-1 mt-1 w-full resize-none bg-transparent text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/40 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:mt-0" />
    </div>
  )
}

function MediaPreview({ file }: { file: File }) {
  const [url] = useState(() => URL.createObjectURL(file))
  useEffect(() => {
    return () => URL.revokeObjectURL(url)
  }, [url])
  return (
    <div className="rounded-2xl border border-border bg-card p-4 animate-fade-in">
      <div className="mb-3 flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{isVideoFile(file) ? 'Preview video' : 'Listen back'}</span>{isVideoFile(file) ? <Film size={15} className="text-primary" /> : <Music2 size={15} className="text-primary" />}</div>
      {url && (isVideoFile(file) ? <video className="max-h-64 w-full rounded-lg bg-background" controls src={url} aria-label="Preview uploaded video" /> : <audio className="h-9 w-full accent-[var(--primary)]" controls src={url} aria-label="Preview uploaded audio" />)}
    </div>
  )
}

function CaptionsIcon() {
  return <div className="flex items-center gap-1"><span className="h-7 w-2 rounded-full bg-primary/60" /><span className="space-y-1"><span className="block h-1.5 w-8 rounded bg-primary" /><span className="block h-1.5 w-5 rounded bg-primary/50" /></span></div>
}

function parseSubtitleText(raw: string): Cue[] {
  const blocks = raw.replace(/^\uFEFF/, '').replace(/\r/g, '').trim().split(/\n\s*\n/)
  const cues: Cue[] = []
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
    const timeIndex = lines.findIndex((line) => line.includes('-->'))
    if (timeIndex < 0) continue
    const match = lines[timeIndex].match(/(\d{1,2}:)?\d{2}:\d{2}[,.]\d{3}/g)
    if (!match || match.length < 2) continue
    const start = parseTime(match[0])
    const end = parseTime(match[1])
    const text = lines.slice(timeIndex + 1).join('\n').replace(/<[^>]*>/g, '').trim()
    if (Number.isFinite(start) && Number.isFinite(end) && end > start && text) cues.push({ start, end, text })
  }
  return cues
}

function parseTime(value: string): number {
  const normalized = value.replace(',', '.')
  const parts = normalized.split(':').map(Number)
  const seconds = parts.pop() ?? 0
  const minutes = parts.pop() ?? 0
  const hours = parts.pop() ?? 0
  return hours * 3600 + minutes * 60 + seconds
}

function alignCues(cues: Cue[], segments: TranscriptSegment[]): Cue[] {
  let cursor = 0
  return cues.map((cue) => {
    const words = cleanWords(cue.text)
    if (!words.length) return cue
    let best = { start: cue.start, end: cue.end, score: 0, next: cursor }
    for (let start = cursor; start < segments.length; start++) {
      let combined = ''
      for (let end = start; end < Math.min(segments.length, start + 6); end++) {
        combined += ` ${segments[end].text}`
        const spoken = cleanWords(combined)
        const spokenSet = new Set(spoken)
        const hits = words.reduce((count, word) => count + (spokenSet.has(word) ? 1 : 0), 0)
        const score = hits / words.length - (end - start) * 0.025
        if (score > best.score) best = { start: segments[start].start, end: segments[end].end, score, next: end + 1 }
        if (score >= 0.88) break
      }
      if (best.score >= 0.88) break
    }
    if (best.score >= 0.2) {
      cursor = Math.max(cursor, best.next)
      return { ...cue, start: best.start, end: best.end }
    }
    return cue
  })
}

function cleanWords(text: string): string[] {
  return text.toLocaleLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []
}

function formatTime(seconds: number): string {
  const totalMilliseconds = Math.round(Math.max(0, seconds) * 1000)
  const hours = Math.floor(totalMilliseconds / 3_600_000)
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000)
  const secs = Math.floor((totalMilliseconds % 60_000) / 1000)
  const millis = totalMilliseconds % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|mov)$/i.test(file.name)
}

function isSupportedAudioFile(file: File): boolean {
  return /\.(mp3|wav|m4a|flac|ogg|webm)$/i.test(file.name) || /audio\/(mpeg|wav|x-wav|mp4|flac|ogg|webm)/i.test(file.type)
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The audio file could not be prepared for transcription.'))
    reader.onerror = () => reject(new Error('The audio file could not be read. Try selecting it again.'))
    reader.readAsDataURL(file)
  })
}

function getTranscriptionErrorMessage(error: unknown): string {
  const details = error as { message?: string; status?: number }
  const message = details?.message || 'We couldn’t sync this audio. Please try again.'
  if (details?.status === 500 || message === 'Something went wrong!') {
    return `The transcription service couldn’t process this file. Try a shorter supported audio file (MP3, WAV, M4A, FLAC, OGG, or WebM), or re-export the audio and try again. (${message})`
  }
  return message
}

async function extractVideoAudio(file: File): Promise<string> {
  const video = document.createElement('video') as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }
  const sourceUrl = URL.createObjectURL(file)
  let stream: MediaStream | undefined
  let recorder: MediaRecorder | undefined
  video.preload = 'auto'
  video.src = sourceUrl
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('This video could not be opened by your browser. Try MP4, MOV, or WebM.'))
    })
    const capture = video.captureStream ?? video.mozCaptureStream
    if (!capture) throw new Error('This browser cannot extract audio from video. Try uploading an audio file instead.')
    const capturedStream = capture.call(video)
    if (!capturedStream.getAudioTracks().length) throw new Error('No audio track was found in this video.')
    stream = capturedStream
    const audioStream = new MediaStream(capturedStream.getAudioTracks())
    const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? { mimeType: 'audio/webm;codecs=opus' } : undefined
    recorder = new MediaRecorder(audioStream, options)
    const chunks: Blob[] = []
    const audioBlob = await new Promise<Blob>((resolve, reject) => {
      recorder!.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      recorder!.onerror = () => reject(new Error('The video audio could not be captured. Try an audio file instead.'))
      recorder!.onstop = () => resolve(new Blob(chunks, { type: recorder!.mimeType || 'audio/webm' }))
      video.onended = () => { if (recorder?.state !== 'inactive') recorder?.stop() }
      recorder!.start()
      void video.play().catch(() => reject(new Error('Your browser blocked video playback. Press play on the preview, then sync again.')))
    })
    if (!audioBlob.size) throw new Error('No audio could be extracted from this video.')
    return await fileToDataUrl(audioBlob)
  } finally {
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    stream?.getTracks().forEach((track) => track.stop())
    video.pause()
    video.src = ''
    URL.revokeObjectURL(sourceUrl)
  }
}
