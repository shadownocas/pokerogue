import { BattlePhase } from "./battle-phase";
import type { EnemyPokemon } from "#app/field/pokemon";
import { catchPokemon } from "#app/data/mystery-encounters/utils/encounter-pokemon-utils";
import { PokeballType } from "#enums/pokeball";

export class PokemonRewardPhase extends BattlePhase {
  public readonly phaseName = "PokemonRewardPhase";
  private pokemonReward: EnemyPokemon[];

  constructor(pokemonReward: EnemyPokemon[]) {
    super();
    this.pokemonReward = pokemonReward;
  }

  async start() {
    super.start();
    for (const pokemon of this.pokemonReward) {
      await catchPokemon(pokemon, null, PokeballType.POKEBALL, false, true);
    }
    this.end();
  }
}
