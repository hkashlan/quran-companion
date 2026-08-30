import { createFileRoute } from "@tanstack/react-router";
import { PlanEditor } from "@/components/PlanEditor";
import { getStudentPlan } from "@/server/queries";

/** A teacher's own review plan (as a student in another teacher's circle). */
export const Route = createFileRoute("/_protected/teacher/plan")({
	loader: async () => getStudentPlan(),
	component: PlanScreen,
});

function PlanScreen() {
	const data = Route.useLoaderData();
	return <PlanEditor data={data} />;
}
