import { DISTRACTION_MOVES, PROTECTING_MOVES } from "#app/data/mystery-encounters/requirements/requirement-groups";
import { modifierTypes } from "#app/data/data-lists";
import { MysteryEncounterType } from "#enums/mystery-encounter-type";
import { MysteryEncounterOptionMode } from "#enums/mystery-encounter-option-mode";
import { MysteryEncounterOptionBuilder } from "#app/data/mystery-encounters/mystery-encounter-option";
import { queueEncounterMessage } from "#app/data/mystery-encounters/utils/encounter-dialogue-utils";
import type { AttackTypeBoosterModifierType } from "#app/modifier/modifier-type";
import type { PokemonHeldItemModifier } from "#app/modifier/modifier";
import { getPokemonSpecies } from "#app/data/pokemon-species";
import type Pokemon from "#app/field/pokemon";
import { SpeciesId } from "#enums/species-id";
import { BattlerTagType } from "#enums/battler-tag-type";
import { globalScene } from "#app/global-scene";
import {
  initBattleWithEnemyConfig,
  setEncounterRewards,
  setEncounterExp,
  leaveEncounterWithoutBattle,
  generateModifierType,
} from "../utils/encounter-phase-utils";
import {
  getHighestStatPlayerPokemon,
  catchPokemon,
  applyModifierTypeToPlayerPokemon,
} from "#app/data/mystery-encounters/utils/encounter-pokemon-utils";
import { MoveRequirement } from "#app/data/mystery-encounters/mystery-encounter-requirements";
import type { EnemyPartyConfig, EnemyPokemonConfig } from "../utils/encounter-phase-utils";
import type MysteryEncounter from "#app/data/mystery-encounters/mystery-encounter";
import { MysteryEncounterBuilder } from "#app/data/mystery-encounters/mystery-encounter";
import { MysteryEncounterTier } from "#enums/mystery-encounter-tier";
import { MoveId } from "#enums/move-id";
import { Nature } from "#enums/nature";
import { BattlerIndex } from "#enums/battler-index";
import { PokemonType } from "#enums/pokemon-type";
import { EnemyPokemon, type PlayerPokemon } from "#app/field/pokemon";
import { PokemonMove } from "#app/data/moves/pokemon-move";
import { PERMANENT_STATS, Stat } from "#enums/stat";
import { CustomPokemonData } from "#app/data/custom-pokemon-data";
import { PokeballType } from "#enums/pokeball";
import { TrainerSlot } from "#enums/trainer-slot";

/* the i18n namespace for the encounter */
const namespace = "mysteryEncounters/strayPokemon";

/**
 * Stray Pokemon encounter.
 * @see {@link https://github.com/pagefaultgames/pokerogue/issues/4420 | GitHub Issue #4420}
 * @see For biome requirements check {@linkcode mysteryEncountersByBiome}
 */
export const StrayPokemonEncounter: MysteryEncounter = MysteryEncounterBuilder.withEncounterType(
  MysteryEncounterType.STRAY_POKEMON,
)
  .withEncounterTier(MysteryEncounterTier.GREAT)
  .withSceneWaveRangeRequirement(30, 90)
  .withFleeAllowed(false)
  .withIntroSpriteConfigs([
    {
      spriteKey: SpeciesId.CHARMANDER.toString(),
      fileRoot: "pokemon",
      hasShadow: true,
      tint: 0.25,
      scale: 1.25,
      repeat: true,
      y: 5,
    },
  ])
  .withIntroDialogue([
    {
      text: `${namespace}:intro`,
    },
  ])
  .withOnInit(() => {
    const encounter = globalScene.currentBattle.mysteryEncounter!;

    // calculate boss mon
    const bossSpecies = getPokemonSpecies(SpeciesId.SEISMITOAD);
    const pokemonConfig: EnemyPokemonConfig = {
      species: bossSpecies,
      isBoss: true,
      shiny: false,
      moveSet: [MoveId.WATERFALL, MoveId.EARTHQUAKE, MoveId.DRAIN_PUNCH, MoveId.ICE_PUNCH],
      abilityIndex: 0,
      nature: Nature.ADAMANT,
      customPokemonData: new CustomPokemonData({ spriteScale: 1.25 }),
    };
    const config: EnemyPartyConfig = {
      levelAdditiveModifier: 0.5,
      pokemonConfigs: [pokemonConfig],
    };
    encounter.enemyPartyConfigs = [config];

    // defined variables used globally
    encounter.misc = {
      fastestPokemon: getFastestPokemon(),
      heldItems: [] as PokemonHeldItemModifier[][],
      originalParty: [] as PlayerPokemon[],
    };
    encounter.setDialogueToken("seismitoadName", getPokemonSpecies(SpeciesId.SEISMITOAD).getName());
    encounter.setDialogueToken("charmanderName", getPokemonSpecies(SpeciesId.CHARMANDER).getName());
    return true;
  })
  .setLocalizationKey(`${namespace}`)
  .withTitle(`${namespace}:title`)
  .withDescription(`${namespace}:description`)
  .withQuery(`${namespace}:query`)
  .withSimpleOption(
    // straightforward battle
    {
      buttonLabel: `${namespace}:option.1.label`,
      buttonTooltip: `${namespace}:option.1.tooltip`,
      selected: [
        {
          text: `${namespace}:option.1.selected`,
        },
      ],
    },
    async () => {
      const encounter = globalScene.currentBattle.mysteryEncounter!;
      setEncounterRewards(undefined, undefined, () => doPostEncounterCleanup(), createCharmanderToJoin());
      encounter.startOfBattleEffects.push({
        sourceBattlerIndex: BattlerIndex.ENEMY,
        targets: [BattlerIndex.ENEMY],
        move: new PokemonMove(MoveId.AQUA_RING),
        ignorePp: true,
      });
      await initBattleWithEnemyConfig(encounter.enemyPartyConfigs[0]);
    },
  )
  .withOption(
    // use protecting move
    MysteryEncounterOptionBuilder.newOptionWithMode(MysteryEncounterOptionMode.DISABLED_OR_SPECIAL)
      .withPrimaryPokemonRequirement(new MoveRequirement(PROTECTING_MOVES, true))
      .withDialogue({
        buttonLabel: `${namespace}:option.2.label`,
        buttonTooltip: `${namespace}:option.2.tooltip`,
        disabledButtonTooltip: `${namespace}:option.2.disabled_tooltip`,
        selected: [
          {
            text: `${namespace}:option.2.selected`,
          },
        ],
      })
      .withOptionPhase(async () => {
        const instance = globalScene.currentBattle.mysteryEncounter!;
        setEncounterExp(instance.primaryPokemon!.id, getPokemonSpecies(SpeciesId.SEISMITOAD).baseExp);
        await catchPokemon(createCharmanderToJoin()[0], null, PokeballType.POKEBALL, false, true);
        // no battles in this option
        leaveEncounterWithoutBattle();
      })
      .build(),
  )
  .withOption(
    // use distracting move
    MysteryEncounterOptionBuilder.newOptionWithMode(MysteryEncounterOptionMode.DISABLED_OR_SPECIAL)
      .withPrimaryPokemonRequirement(new MoveRequirement(DISTRACTION_MOVES, true))
      .withDialogue({
        buttonLabel: `${namespace}:option.3.label`,
        buttonTooltip: `${namespace}:option.3.tooltip`,
        disabledButtonTooltip: `${namespace}:option.3.disabled_tooltip`,
        selected: [
          {
            text: `${namespace}:option.3.selected`,
          },
        ],
      })
      .withOptionPhase(async () => {
        setEncounterRewards(undefined, undefined, () => doPostEncounterCleanup(), createCharmanderToJoin());
        const encounter = globalScene.currentBattle.mysteryEncounter!;
        const statChangesForBattle: (Stat.ATK | Stat.DEF | Stat.SPATK | Stat.SPDEF | Stat.SPD | Stat.ACC | Stat.EVA)[] =
          [Stat.ATK, Stat.DEF, Stat.SPATK, Stat.SPDEF, Stat.SPD];

        const config = globalScene.currentBattle.mysteryEncounter!.enemyPartyConfigs[0];
        config.pokemonConfigs![0].tags = [BattlerTagType.MYSTERY_ENCOUNTER_POST_SUMMON];
        config.pokemonConfigs![0].mysteryEncounterBattleEffects = (pokemon: Pokemon) => {
          // decrease enemy stats by 1
          globalScene.phaseManager.unshiftNew(
            "StatStageChangePhase",
            pokemon.getBattlerIndex(),
            true,
            statChangesForBattle,
            -1,
          );
        };
        await initBattleWithEnemyConfig(encounter.enemyPartyConfigs[0]);
      })
      .build(),
  )
  .withOption(
    // send fastest pokemon off to help
    MysteryEncounterOptionBuilder.newOptionWithMode(MysteryEncounterOptionMode.DISABLED_OR_SPECIAL)
      .withDialogue({
        buttonLabel: `${namespace}:option.4.label`,
        buttonTooltip: `${namespace}:option.4.tooltip`,
        selected: [
          {
            text: `${namespace}:option.4.selected`,
          },
        ],
      })
      .withOptionPhase(async () => {
        setEncounterRewards(undefined, undefined, () => doPostEncounterCleanup(), createCharmanderToJoin());
        const encounter = globalScene.currentBattle.mysteryEncounter!;
        encounter.startOfBattleEffects.push({
          sourceBattlerIndex: BattlerIndex.ENEMY,
          targets: [BattlerIndex.ENEMY],
          move: new PokemonMove(MoveId.HYDRO_PUMP),
          ignorePp: true,
        });
        const statChangesForBattle: (Stat.ATK | Stat.DEF | Stat.SPATK | Stat.SPDEF | Stat.SPD | Stat.ACC | Stat.EVA)[] =
          [Stat.ATK, Stat.DEF, Stat.SPATK, Stat.SPDEF, Stat.SPD];

        const config = globalScene.currentBattle.mysteryEncounter!.enemyPartyConfigs[0];
        config.pokemonConfigs![0].tags = [BattlerTagType.MYSTERY_ENCOUNTER_POST_SUMMON];
        config.pokemonConfigs![0].mysteryEncounterBattleEffects = (pokemon: Pokemon) => {
          queueEncounterMessage(`${namespace}:option.4.boss_enraged`);
          // enemy stats increased by one
          globalScene.phaseManager.unshiftNew(
            "StatStageChangePhase",
            pokemon.getBattlerIndex(),
            true,
            statChangesForBattle,
            1,
          );
        };
        // removes fastest pokemon from party
        removePokemonFromPartyAndStoreHeldItems(encounter.misc.fastestPokemon);
        await initBattleWithEnemyConfig(encounter.enemyPartyConfigs[0]);
      })
      .build(),
  )
  .build();

function removePokemonFromPartyAndStoreHeldItems(chosenPokemon: PlayerPokemon) {
  // calculates removes fastest pokemon from party
  const party = globalScene.getPlayerParty();
  const encounter = globalScene.currentBattle.mysteryEncounter!;
  encounter.misc.originalParty = party.filter(p => p === chosenPokemon);
  encounter.misc.heldItems = encounter.misc.originalParty.map(p => p.getHeldItems());
  const updatedParty = party.filter(p => p !== chosenPokemon);
  globalScene["party"] = updatedParty;
}

function restorePartyAndHeldItems() {
  // restore original party
  const encounter = globalScene.currentBattle.mysteryEncounter!;
  globalScene.getPlayerParty().push(...encounter.misc.originalParty);
  for (const pokemonHeldItemsList of encounter.misc.heldItems) {
    for (const heldItem of pokemonHeldItemsList) {
      globalScene.addModifier(heldItem, true, false, false, true);
    }
  }
  globalScene.updateModifiers(true);
}

function doPostEncounterCleanup(charcoal = false) {
  // reset needed changes
  restorePartyAndHeldItems();
  queueEncounterMessage(`${namespace}:got_charmander`);
  if (charcoal) {
    giveLeadPokemonAttackTypeBoostItem();
  }
}

function createCharmanderToJoin() {
  // create charmander
  const charmanderData = new EnemyPokemon(getPokemonSpecies(SpeciesId.CHARMANDER), 5, TrainerSlot.NONE, false, true);
  charmanderData.moveset = [
    new PokemonMove(MoveId.FLAMETHROWER),
    new PokemonMove(MoveId.SLASH),
    new PokemonMove(MoveId.DRAGON_RAGE),
    new PokemonMove(MoveId.ENDURE),
  ];
  charmanderData.passive = true;
  return [charmanderData];
}

function giveLeadPokemonAttackTypeBoostItem() {
  // give first party pokemon attack type boost item for free at end of battle
  const leadPokemon = globalScene.getPlayerParty()?.[0];
  if (leadPokemon) {
    // generate type booster held item: charcoal
    const boosterModifierType = generateModifierType(modifierTypes.ATTACK_TYPE_BOOSTER, [
      PokemonType.FIRE,
    ]) as AttackTypeBoosterModifierType;

    applyModifierTypeToPlayerPokemon(leadPokemon, boosterModifierType);

    const encounter = globalScene.currentBattle.mysteryEncounter!;
    encounter.setDialogueToken("itemName", boosterModifierType.name);
    encounter.setDialogueToken("leadPokemon", leadPokemon.getNameToRender());
    queueEncounterMessage(`${namespace}:found_item`);
  }
}

function getFastestPokemon() {
  // finds and returns fastest player pokemon
  const fastestPokemon = getHighestStatPlayerPokemon(PERMANENT_STATS[Stat.SPD], true, false);
  const encounter = globalScene.currentBattle.mysteryEncounter!;
  encounter.setDialogueToken("fastestPokemon", fastestPokemon.getName());
  return fastestPokemon;
}
