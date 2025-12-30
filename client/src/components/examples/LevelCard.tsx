import LevelCard from '../LevelCard';

export default function LevelCardExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 max-w-4xl">
      <LevelCard
        number={1}
        title="Foundations 1"
        progress={0}
        isCompleted={false}
        track="english"
        onClick={() => {}}
      />
      <LevelCard
        number={2}
        title="Foundations 2"
        progress={65}
        isCompleted={false}
        track="english"
        onClick={() => {}}
      />
      <LevelCard
        number={3}
        title="Foundations 3"
        progress={100}
        isCompleted={true}
        track="english"
        onClick={() => {}}
      />
    </div>
  );
}
