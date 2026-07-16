import { createFileRoute } from "@tanstack/react-router";
import { Search as SearchIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Buscar empresas · LeadFinder AI" },
      { name: "description", content: "Pesquise empresas locais com Google Places." },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  return (
    <AppShell
      title="Buscar empresas"
      description="Pesquisa via Google Places (disponível na Etapa 2)"
    >
      <Card className="border-border/60 bg-card/60 p-6">
        <form
          className="grid gap-4 md:grid-cols-6"
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="md:col-span-2">
            <Label>Palavra-chave</Label>
            <Input placeholder="restaurante, dentista, academia..." />
          </div>
          <div>
            <Label>Cidade</Label>
            <Input placeholder="São Paulo" />
          </div>
          <div>
            <Label>Estado</Label>
            <Input placeholder="SP" />
          </div>
          <div>
            <Label>País</Label>
            <Input placeholder="Brasil" defaultValue="Brasil" />
          </div>
          <div>
            <Label>Raio (km)</Label>
            <Input type="number" min={1} max={50} defaultValue={10} />
          </div>
          <div className="md:col-span-6 flex justify-end">
            <Button type="submit" disabled>
              <SearchIcon className="mr-2 size-4" />
              Pesquisar (Etapa 2)
            </Button>
          </div>
        </form>
      </Card>

      <div className="mt-6 rounded-xl border border-dashed border-border/60 bg-card/30 p-12 text-center text-sm text-muted-foreground">
        Os resultados aparecerão aqui após conectar a Google Places API.
      </div>
    </AppShell>
  );
}