import { NextRequest, NextResponse } from 'next/server';
import Sentiment from 'sentiment';

const sentiment = new Sentiment();

interface Segment {
  start: number;
  end: number;
  text: string;
  score: number;
}

function parseTranscript(content: string): Segment[] {
  const segments: Segment[] = [];

  // Try to parse SRT format first
  const srtPattern = /(\d+)\n(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})\n([\s\S]*?)(?=\n\n|\n*$)/g;
  let match;

  while ((match = srtPattern.exec(content)) !== null) {
    const startHours = parseInt(match[2]);
    const startMinutes = parseInt(match[3]);
    const startSeconds = parseInt(match[4]);
    const startMs = parseInt(match[5]);

    const endHours = parseInt(match[6]);
    const endMinutes = parseInt(match[7]);
    const endSeconds = parseInt(match[8]);
    const endMs = parseInt(match[9]);

    const start = startHours * 3600 + startMinutes * 60 + startSeconds + startMs / 1000;
    const end = endHours * 3600 + endMinutes * 60 + endSeconds + endMs / 1000;
    const text = match[10].trim().replace(/\n/g, ' ');

    segments.push({ start, end, text, score: 0 });
  }

  // If no SRT format found, try plain text with timestamps
  if (segments.length === 0) {
    const lines = content.split('\n').filter(line => line.trim());

    // Try format: [00:00:00] text
    const timestampPattern = /\[(\d{2}):(\d{2}):(\d{2})\]\s*(.*)/;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(timestampPattern);
      if (match) {
        const hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const seconds = parseInt(match[3]);
        const text = match[4].trim();

        const start = hours * 3600 + minutes * 60 + seconds;
        const end = i < lines.length - 1 ? start + 5 : start + 5; // Default 5 second segments

        segments.push({ start, end, text, score: 0 });
      }
    }
  }

  // If still no segments, split plain text into sentences with estimated timestamps
  if (segments.length === 0) {
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];
    let currentTime = 0;

    sentences.forEach(sentence => {
      const text = sentence.trim();
      const duration = Math.max(3, Math.min(10, text.length / 10)); // Estimate duration

      segments.push({
        start: currentTime,
        end: currentTime + duration,
        text,
        score: 0
      });

      currentTime += duration;
    });
  }

  return segments;
}

function analyzeSentiment(segments: Segment[], threshold: number): Segment[] {
  const analyzedSegments = segments.map(segment => {
    const result = sentiment.analyze(segment.text);
    return {
      ...segment,
      score: result.score
    };
  });

  // Filter segments based on threshold
  return analyzedSegments.filter(segment => segment.score >= threshold);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const transcriptFile = formData.get('transcript') as File;
    const videoUrl = formData.get('videoUrl') as string;
    const threshold = parseFloat(formData.get('threshold') as string);

    if (!transcriptFile || !videoUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Read transcript file
    const transcriptContent = await transcriptFile.text();

    // Parse transcript
    const segments = parseTranscript(transcriptContent);

    if (segments.length === 0) {
      return NextResponse.json(
        { error: 'Could not parse transcript. Please use SRT format or plain text with timestamps.' },
        { status: 400 }
      );
    }

    // Analyze sentiment
    const matchingSegments = analyzeSentiment(segments, threshold);

    // Calculate statistics
    const totalScore = segments.reduce((sum, seg) => sum + seg.score, 0);
    const averageSentiment = totalScore / segments.length;

    // Generate FFmpeg command for n8n
    const filterComplex = matchingSegments
      .map((seg, idx) => `[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[v${idx}]; [0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${idx}]`)
      .join('; ');

    const concatInputs = matchingSegments
      .map((_, idx) => `[v${idx}][a${idx}]`)
      .join('');

    const ffmpegCommand = matchingSegments.length > 0
      ? `ffmpeg -i "${videoUrl}" -filter_complex "${filterComplex}; ${concatInputs}concat=n=${matchingSegments.length}:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" output.mp4`
      : null;

    return NextResponse.json({
      success: true,
      videoUrl,
      threshold,
      totalSegments: segments.length,
      matchingSegments: matchingSegments.length,
      averageSentiment,
      segments: matchingSegments,
      ffmpegCommand,
      n8nData: {
        segments: matchingSegments,
        videoUrl,
        threshold,
        statistics: {
          total: segments.length,
          matching: matchingSegments.length,
          averageSentiment
        }
      }
    });
  } catch (error: any) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
