import { createFileRoute } from "@tanstack/react-router";
import { useRememberedTab } from "@/hooks/useRememberedTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SalariesTable } from "@/components/compensation/SalariesTable";
import { BonusSchemes } from "@/components/compensation/BonusSchemes";

/** Compensation: everyone's salaries and their changes, and the bonus schemes. */
export const Route = createFileRoute("/_authenticated/compensation")({
  head: () => ({ meta: [{ title: "Compensation — Talentloom" }] }),
  component: CompensationPage,
});

const COMPENSATION_TABS = ["salaries", "bonuses"] as const;

function CompensationPage() {
  const [tab, chooseTab] = useRememberedTab("compensation", COMPENSATION_TABS, "salaries");
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Compensation</h1>
        <p className="text-sm text-muted-foreground">
          Everyone's salaries and how they have changed, and the organisation's bonus schemes.
        </p>
      </div>
      <Tabs value={tab} onValueChange={chooseTab}>
        <TabsList>
          <TabsTrigger value="salaries">Salaries</TabsTrigger>
          <TabsTrigger value="bonuses">Bonus schemes</TabsTrigger>
        </TabsList>
        <TabsContent value="salaries">
          <SalariesTable />
        </TabsContent>
        <TabsContent value="bonuses">
          <BonusSchemes />
        </TabsContent>
      </Tabs>
    </div>
  );
}
