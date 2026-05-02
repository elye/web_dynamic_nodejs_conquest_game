interface HowToPlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HowToPlay({ isOpen, onClose }: HowToPlayProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 border border-slate-600 rounded-xl max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h2 className="text-xl font-bold text-white">How to Play Conquest</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none px-1"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-4 space-y-5 text-sm text-gray-300">
          {/* Objective */}
          <section>
            <h3 className="text-white font-semibold mb-1">🎯 Objective</h3>
            <p>Conquer the map by capturing territory and eliminating other players.</p>
          </section>

          {/* Your Turn */}
          <section>
            <h3 className="text-white font-semibold mb-1">⚔️ Your Turn</h3>
            <ol className="list-decimal list-inside space-y-1">
              <li><strong>Move units</strong> — click a unit, then an adjacent hex.</li>
              <li><strong>Buy units</strong> — select empty owned hex, click unit button.</li>
              <li><strong>Build towers</strong> — select empty owned hex, click tower button.</li>
              <li>End turn when done.</li>
            </ol>
          </section>

          {/* Units */}
          <section>
            <h3 className="text-white font-semibold mb-2">🗡️ Units</h3>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-slate-700">
                  <th className="pb-1">Unit</th>
                  <th className="pb-1">Str</th>
                  <th className="pb-1">Cost</th>
                  <th className="pb-1">Upkeep</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                <tr><td className="py-1">🧑‍🌾 Peasant</td><td>1</td><td>10g</td><td>2g</td></tr>
                <tr><td className="py-1">💂 Spearman</td><td>2</td><td>20g</td><td>6g</td></tr>
                <tr><td className="py-1">🤴 Baron</td><td>3</td><td>30g</td><td>18g</td></tr>
                <tr><td className="py-1">🐴 Knight</td><td>4</td><td>40g</td><td>54g</td></tr>
              </tbody>
            </table>
          </section>

          {/* Combat */}
          <section>
            <h3 className="text-white font-semibold mb-1">⚔️ Combat</h3>
            <p>Stronger units beat weaker ones. Units must be stronger than defender + tower bonus.</p>
          </section>

          {/* Economy */}
          <section>
            <h3 className="text-white font-semibold mb-1">💰 Economy</h3>
            <p>Each hex = 1 gold/turn. Units cost upkeep. Go bankrupt = units die. Trees block income.</p>
          </section>

          {/* Structures */}
          <section>
            <h3 className="text-white font-semibold mb-1">🏗️ Structures</h3>
            <ul className="space-y-1">
              <li>🏰 <strong>Tower</strong> (15g) — +1 defense</li>
              <li>🏯 <strong>Strong Tower</strong> (35g) — +2 defense</li>
            </ul>
          </section>

          {/* Tips */}
          <section>
            <h3 className="text-white font-semibold mb-1">💡 Tips</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Merge same units to upgrade.</li>
              <li>Split enemy territory.</li>
              <li>Don&apos;t over-expand!</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
