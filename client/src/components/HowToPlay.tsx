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
              <li><strong>Buy units</strong> — select a hex in a province with a ⭐ capitol.</li>
              <li><strong>Build structures</strong> — select an empty owned hex, click structure button.</li>
              <li>End turn when done.</li>
            </ol>
          </section>

          {/* Capitols */}
          <section>
            <h3 className="text-white font-semibold mb-1">⭐ Capitols</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Every province (2+ connected hexes) gets a capitol automatically (Farmhouse with ⭐).</li>
              <li>You need a capitol to buy units in that province.</li>
              <li>Capitols can be upgraded (Farmhouse → Tower → Castle) for the price difference.</li>
              <li>Capturing an enemy capitol transfers its gold to your richest province at end of turn.</li>
              <li>If territory splits, the fragment without a capitol promotes its strongest structure to capitol. If none exist, a new Farmhouse capitol is placed.</li>
              <li>Capitol defense depends on its structure type (0/1/2).</li>
            </ul>
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
            <p className="mt-1 text-xs text-gray-400">Merge two units on the same hex to upgrade (e.g. Peasant + Peasant = Spearman).</p>
            <p className="mt-1 text-xs text-gray-400">🏠 <strong>Retire</strong> a unit to remove it and reclaim half its cost (5g / 10g / 15g / 20g). Also reduces upkeep.</p>
          </section>

          {/* Combat */}
          <section>
            <h3 className="text-white font-semibold mb-1">⚔️ Combat</h3>
            <p>Attacker must be stronger than defender + structure defense bonus.</p>
          </section>

          {/* Economy */}
          <section>
            <h3 className="text-white font-semibold mb-1">💰 Economy</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Each hex = 1 gold/turn income (per province).</li>
              <li>Units cost upkeep every turn.</li>
              <li>🌲 Trees block income. Move a unit onto them to chop.</li>
              <li>☠️ If a province goes bankrupt, all its units starve.</li>
            </ul>
          </section>

          {/* Structures */}
          <section>
            <h3 className="text-white font-semibold mb-1">🏗️ Structures</h3>
            <ul className="space-y-1">
              <li>� <strong>Farmhouse</strong> (10g) — no defense bonus</li>
              <li>🏰 <strong>Tower</strong> (20g) — +1 defense to hex and neighbors</li>
              <li>🏯 <strong>Castle</strong> (30g) — +2 defense to hex and neighbors</li>
            </ul>
            <p className="mt-1 text-xs text-gray-400">Units can jump through friendly structures to reach tiles on the other side.</p>
          </section>

          {/* Tips */}
          <section>
            <h3 className="text-white font-semibold mb-1">💡 Tips</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Protect your capitols — losing one gives the attacker all that province&apos;s gold.</li>
              <li>Target enemy capitols to steal their gold and cripple their economy.</li>
              <li>Split enemy territory to create weak fragments with 0 gold.</li>
              <li>Don&apos;t over-expand — watch your upkeep!</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
