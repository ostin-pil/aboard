import { graph } from "@/lib/graph";
import { toEngineData } from "@/lib/engine-adapter";
import { GraphFullbleed } from "@/components/GraphFullbleed";

export default function GraphPage() {
  const engineData = toEngineData(graph);
  return <GraphFullbleed data={engineData} />;
}
