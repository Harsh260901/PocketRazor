import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Text,
  Heading,
  Button,
  IconButton,
  TextArea,
  Spinner,
  CloseIcon,
  MicIcon,
  SquareIcon,
  AlertCircleIcon,
} from '@razorpay/blade/components';

// The browser's built-in speech recognition (Chrome, Edge, Safari).
// Firefox doesn't have it, so we fall back to typing there.
const SpeechRecognition =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

/**
 * Panel that slides up when a round mic button is tapped. Used for both
 * "talk to build a plan" and "talk to add a member".
 * Steps: listening → (stop) → thinking → onResult(fields, whatTheySaid)
 * Merchants can switch to typing at any point.
 *
 * Props:
 * - title, subtitle, example, typeLabel: wording for the panel
 * - endpoint: our server route that asks Gemini (e.g. /api/parse-plan)
 * - extraBody: anything else the server needs (e.g. the merchant's plans)
 * - isUseful(fields): false if the AI found nothing usable
 * - nothingFoundMessage: shown when isUseful returns false
 */
export default function VoiceSheet({
  title,
  subtitle,
  example,
  typeLabel,
  endpoint,
  extraBody = {},
  isUseful = () => true,
  nothingFoundMessage = "Couldn't find the details in that. Try again.",
  onClose,
  onResult,
}) {
  // 'listening' | 'typing' | 'thinking' | 'error'
  const [mode, setMode] = useState(SpeechRecognition ? 'listening' : 'typing');
  const [finalText, setFinalText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [typedText, setTypedText] = useState('');
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const transcriptRef = useRef(''); // latest words, readable inside speech callbacks

  /* ---------- Send the words to our server, which asks Gemini ---------- */
  const fillFields = async (text) => {
    const words = text.trim();
    if (!words) {
      setError("Didn't catch that. Try again, or type it instead.");
      setMode('error');
      return;
    }
    setMode('thinking');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...extraBody, text: words }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
      if (!isUseful(data)) throw new Error(nothingFoundMessage);
      onResult(data, words);
    } catch (e) {
      setError(e.message);
      setMode('error');
    }
  };

  /* ---------- Listening ---------- */
  const startListening = () => {
    if (!SpeechRecognition) {
      setMode('typing');
      return;
    }
    // Only ever one listening session at a time
    recognitionRef.current?.discard();
    recognitionRef.current = null;
    setFinalText('');
    setInterimText('');
    transcriptRef.current = '';
    setError(null);

    // Each listening session has its own "discard" flag, so an old session
    // that was cancelled can't fire late and interfere with a new one.
    const rec = new SpeechRecognition();
    let aborted = false; // cancelled or failed: ignore anything it does later
    let submitted = false; // what was heard has already been sent to the AI
    let fallbackTimer = null;

    // Send what was heard to the AI, exactly once per session
    const submitOnce = () => {
      if (aborted || submitted) return;
      submitted = true;
      clearTimeout(fallbackTimer);
      fillFields(transcriptRef.current);
    };

    rec.discard = () => {
      aborted = true;
      clearTimeout(fallbackTimer);
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
    };

    // Merchant tapped stop. Normally the browser then fires onend, but it
    // sometimes never does (especially on later sessions), so after 1.5s
    // we finish it ourselves with whatever was heard.
    rec.finish = () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
      fallbackTimer = setTimeout(() => {
        submitOnce();
        try {
          rec.abort();
        } catch {
          /* already stopped */
        }
      }, 1500);
    };
    rec.lang = 'en-IN'; // Indian English
    rec.continuous = true; // keep listening through short pauses
    rec.interimResults = true; // show words while they're being spoken

    rec.onresult = (event) => {
      if (aborted) return;
      let done = '';
      let pending = '';
      for (let i = 0; i < event.results.length; i++) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) done += piece;
        else pending += piece;
      }
      setFinalText(done);
      setInterimText(pending);
      transcriptRef.current = (done + ' ' + pending).trim();
    };

    rec.onerror = (event) => {
      if (aborted || submitted || event.error === 'aborted') return;
      aborted = true; // don't also submit in onend
      clearTimeout(fallbackTimer);
      const messages = {
        'not-allowed': 'Microphone access is blocked. Allow it in your browser settings, or type instead.',
        'service-not-allowed': 'Microphone access is blocked. Allow it in your browser settings, or type instead.',
        'no-speech': "Didn't hear anything. Try again, or type instead.",
        'audio-capture': 'No microphone found. Type your plan instead.',
        network: 'Voice needs an internet connection. Try again, or type instead.',
      };
      setError(messages[event.error] || 'Voice input stopped. Try again, or type instead.');
      setMode('error');
    };

    // Fires when the merchant taps stop, or the browser stops after a long pause
    rec.onend = () => {
      if (recognitionRef.current === rec) recognitionRef.current = null;
      submitOnce();
    };

    recognitionRef.current = rec;
    setMode('listening');
    try {
      rec.start();
    } catch {
      setMode('typing');
    }
  };

  // Finish: show progress straight away, then send what was heard to the AI
  const stopListening = () => {
    const rec = recognitionRef.current;
    if (!rec) return;
    setMode('thinking');
    rec.finish();
  };

  const cancelListening = () => {
    recognitionRef.current?.discard();
    recognitionRef.current = null;
  };

  // Start listening as soon as the panel opens; stop if it closes.
  // The tiny delay means that when React opens the panel twice in a row
  // (it does this in development to catch bugs), only one session starts.
  useEffect(() => {
    if (!SpeechRecognition) return undefined;
    const timer = setTimeout(startListening, 50);
    return () => {
      clearTimeout(timer);
      cancelListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchToTyping = () => {
    cancelListening();
    setTypedText((t) => t || transcriptRef.current);
    setError(null);
    setMode('typing');
  };

  const close = () => {
    cancelListening();
    onClose();
  };

  /* ---------- Screens ---------- */
  const transcript = (finalText + ' ' + interimText).trim();

  return (
    <div className="sheet-backdrop" onClick={mode === 'thinking' ? undefined : close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sheet-handle" />
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Heading size="medium" weight="semibold">
              {title}
            </Heading>
            <Text size="small" color="surface.text.gray.muted">
              {subtitle}
            </Text>
          </Box>
          {mode !== 'thinking' && <IconButton icon={CloseIcon} accessibilityLabel="Close" onClick={close} />}
        </Box>

        {mode === 'listening' && (
          <Box display="flex" flexDirection="column" alignItems="center" marginTop="spacing.6">
            <button className="voice-orb is-listening" onClick={stopListening} aria-label="Stop and fill in the form">
              <SquareIcon size="large" color="surface.icon.staticWhite.normal" />
            </button>
            <Box marginTop="spacing.3">
              <Text size="small" color="surface.text.gray.muted">
                Listening… tap to finish
              </Text>
            </Box>
            <div className="voice-transcript" aria-live="polite">
              {transcript ? (
                <>
                  {finalText}
                  <span style={{ color: '#8a94a6' }}> {interimText}</span>
                </>
              ) : (
                <span style={{ color: '#8a94a6' }}>For example: "{example}"</span>
              )}
            </div>
            <Button variant="tertiary" size="small" onClick={switchToTyping}>
              Type instead
            </Button>
          </Box>
        )}

        {mode === 'typing' && (
          <Box marginTop="spacing.5">
            <TextArea
              label={typeLabel}
              placeholder={example}
              numberOfLines={3}
              value={typedText}
              onChange={({ value }) => setTypedText(value ?? '')}
            />
            <Box marginTop="spacing.4" display="flex" gap="spacing.3">
              <div style={{ flex: 1 }} className="rzp-blue-btn">
                <Button isFullWidth onClick={() => fillFields(typedText)}>
                  Fill in form
                </Button>
              </div>
              {SpeechRecognition && (
                <Box flex="1">
                  <Button variant="secondary" icon={MicIcon} iconPosition="left" isFullWidth onClick={startListening}>
                    Speak instead
                  </Button>
                </Box>
              )}
            </Box>
          </Box>
        )}

        {mode === 'thinking' && (
          <Box display="flex" flexDirection="column" alignItems="center" gap="spacing.4" paddingY="spacing.8">
            <Spinner accessibilityLabel="Filling in the form" size="large" />
            <Text size="medium" color="surface.text.gray.normal">
              Filling in the form…
            </Text>
          </Box>
        )}

        {mode === 'error' && (
          <Box marginTop="spacing.5">
            <Box display="flex" gap="spacing.3" alignItems="flex-start">
              <Box paddingTop="spacing.1">
                <AlertCircleIcon size="medium" color="feedback.icon.negative.intense" />
              </Box>
              <Text size="medium" color="surface.text.gray.normal">
                {error}
              </Text>
            </Box>
            <Box marginTop="spacing.5" display="flex" gap="spacing.3">
              {SpeechRecognition && (
                <div style={{ flex: 1 }} className="rzp-blue-btn">
                  <Button isFullWidth icon={MicIcon} iconPosition="left" onClick={startListening}>
                    Try again
                  </Button>
                </div>
              )}
              <Box flex="1">
                <Button variant="secondary" isFullWidth onClick={switchToTyping}>
                  Type instead
                </Button>
              </Box>
            </Box>
          </Box>
        )}
      </div>
    </div>
  );
}
