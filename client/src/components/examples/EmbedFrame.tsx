import EmbedFrame from '../EmbedFrame';

export default function EmbedFrameExample() {
  return (
    <div className="space-y-6 p-8 max-w-4xl">
      <EmbedFrame
        type="quizlet"
        embedUrl="https://quizlet.com"
        title="Vocabulary Set 1"
        onInteraction={() => {}}
      />
      <EmbedFrame
        type="youtube"
        embedUrl="https://youtube.com"
        title="Lesson Video 1"
        onInteraction={() => {}}
      />
    </div>
  );
}
