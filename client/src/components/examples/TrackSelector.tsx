import TrackSelector from '../TrackSelector';

export default function TrackSelectorExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 max-w-6xl">
      <TrackSelector
        title="English Foundations"
        description="Master English from the basics"
        levelCount={17}
        flag="🇺🇸"
        onClick={() => {}}
      />
      <TrackSelector
        title="Spanish Foundations"
        description="Learn Spanish fundamentals"
        levelCount={12}
        flag="🇪🇸"
        onClick={() => {}}
      />
    </div>
  );
}
