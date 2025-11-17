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

  // Try SRT format
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

  // Fallback to plain text
  if (segments.length === 0) {
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];
    let currentTime = 0;

    sentences.forEach(sentence => {
      const text = sentence.trim();
      const duration = Math.max(3, Math.min(10, text.length / 10));

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

  return analyzedSegments.filter(segment => segment.score >= threshold);
}

// n8n webhook endpoint
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      transcript,
      transcriptContent,
      videoUrl,
      threshold = 0
    } = body;

    if (!videoUrl) {
      return NextResponse.json(
        { error: 'videoUrl is required' },
        { status: 400 }
      );
    }

    const content = transcriptContent || transcript;

    if (!content) {
      return NextResponse.json(
        { error: 'transcript or transcriptContent is required' },
        { status: 400 }
      );
    }

    // Parse and analyze
    const segments = parseTranscript(content);

    if (segments.length === 0) {
      return NextResponse.json(
        { error: 'Could not parse transcript' },
        { status: 400 }
      );
    }

    const matchingSegments = analyzeSentiment(segments, threshold);

    const totalScore = segments.reduce((sum, seg) => sum + seg.score, 0);
    const averageSentiment = totalScore / segments.length;

    // Generate FFmpeg command
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
      cutPoints: matchingSegments.map(seg => ({
        start: seg.start,
        end: seg.end,
        duration: seg.end - seg.start
      })),
      statistics: {
        total: segments.length,
        matching: matchingSegments.length,
        averageSentiment,
        percentageKept: (matchingSegments.length / segments.length) * 100
      }
    });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
