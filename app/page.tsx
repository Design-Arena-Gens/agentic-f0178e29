'use client';

import { useState } from 'react';

export default function Home() {
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [sentimentThreshold, setSentimentThreshold] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      if (transcriptFile) {
        formData.append('transcript', transcriptFile);
      }
      formData.append('videoUrl', videoUrl);
      formData.append('threshold', sentimentThreshold.toString());

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Processing failed');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <main className="min-h-screen p-8 bg-gradient-to-br from-gray-900 to-gray-800">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-2">Sentiment Video Cutter</h1>
        <p className="text-gray-400 mb-8">Upload transcript and video URL to cut based on sentiment analysis</p>

        <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-lg shadow-xl mb-8">
          <div className="mb-6">
            <label className="block text-white mb-2 font-semibold">
              Transcript File (TXT/SRT)
            </label>
            <input
              type="file"
              accept=".txt,.srt"
              onChange={(e) => setTranscriptFile(e.target.files?.[0] || null)}
              className="w-full p-3 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-white mb-2 font-semibold">
              Video URL (or local path for n8n)
            </label>
            <input
              type="text"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://example.com/video.mp4"
              className="w-full p-3 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-white mb-2 font-semibold">
              Sentiment Threshold: {sentimentThreshold}
            </label>
            <input
              type="range"
              min="-5"
              max="5"
              step="0.5"
              value={sentimentThreshold}
              onChange={(e) => setSentimentThreshold(parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Negative (-5)</span>
              <span>Neutral (0)</span>
              <span>Positive (5)</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={processing}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold py-3 px-6 rounded transition-colors"
          >
            {processing ? 'Processing...' : 'Analyze & Cut Video'}
          </button>
        </form>

        {error && (
          <div className="bg-red-900 border border-red-700 text-white p-4 rounded-lg mb-8">
            <strong>Error:</strong> {error}
          </div>
        )}

        {result && (
          <div className="bg-gray-800 p-6 rounded-lg shadow-xl">
            <h2 className="text-2xl font-bold text-white mb-4">Analysis Results</h2>

            <div className="mb-6">
              <h3 className="text-lg font-semibold text-blue-400 mb-2">Summary</h3>
              <div className="grid grid-cols-2 gap-4 text-white">
                <div>
                  <span className="text-gray-400">Total Segments:</span> {result.totalSegments}
                </div>
                <div>
                  <span className="text-gray-400">Matching Segments:</span> {result.matchingSegments}
                </div>
                <div>
                  <span className="text-gray-400">Avg Sentiment:</span> {result.averageSentiment.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-lg font-semibold text-blue-400 mb-2">Segments to Keep</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {result.segments.map((segment: any, idx: number) => (
                  <div key={idx} className="bg-gray-700 p-3 rounded">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-white font-mono text-sm">
                        {segment.start.toFixed(2)}s - {segment.end.toFixed(2)}s
                      </span>
                      <span className={`font-bold ${segment.score >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        Score: {segment.score.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-gray-300 text-sm">{segment.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-blue-900 p-4 rounded">
              <h3 className="text-lg font-semibold text-white mb-2">n8n Integration</h3>
              <p className="text-gray-300 text-sm mb-2">Use this data in your n8n workflow:</p>
              <pre className="bg-gray-950 p-3 rounded text-xs text-gray-300 overflow-x-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
