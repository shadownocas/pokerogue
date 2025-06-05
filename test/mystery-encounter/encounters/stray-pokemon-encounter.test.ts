import * as MysteryEncounters from "#app/data/mystery-encounters/mystery-encounters";
import { Biome } from "#enums/biome";
import { MysteryEncounterType } from "#enums/mystery-encounter-type";
import { Species } from "#enums/species";
import GameManager from "#test/testUtils/gameManager";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runMysteryEncounterToEnd,
  runSelectMysteryEncounterOption,
} from "#test/mystery-encounter/encounter-test-utils";
import type BattleScene from "#app/battle-scene";
import { MysteryEncounterOptionMode } from "#enums/mystery-encounter-option-mode";
import { MysteryEncounterTier } from "#enums/mystery-encounter-tier";
import { initSceneWithoutEncounterPhase } from "#test/testUtils/gameManagerUtils";
import MysteryEncounter from "#app/data/mystery-encounters/mystery-encounter";
import { MysteryEncounterPhase } from "#app/phases/mystery-encounter-phases";
import * as EncounterPhaseUtils from "#app/data/mystery-encounters/utils/encounter-phase-utils";
import { StrayPokemonEncounter } from "#app/data/mystery-encounters/encounters/stray-pokemon-encounter";
import { CommandPhase } from "#app/phases/command-phase";
import { getPokemonSpecies } from "#app/data/pokemon-species";
import { Moves } from "#enums/moves";
import { MysteryEncounterMode } from "#enums/mystery-encounter-mode";
import { PokemonMove } from "#app/field/pokemon";

const namespace = "mysteryEncounters/strayPokemon";
const defaultParty = [Species.LAPRAS, Species.GENGAR, Species.ABRA];
const defaultBiome = Biome.FOREST;
const defaultWave = 33;

describe("Stray Pokemon - Mystery Encounter", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let scene: BattleScene;

  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });

  beforeEach(async () => {
    game = new GameManager(phaserGame);
    scene = game.scene;
    game.override.mysteryEncounterChance(100);
    game.override.startingWave(defaultWave);
    game.override.startingBiome(defaultBiome);
    game.override.disableTrainerWaves();

    vi.spyOn(MysteryEncounters, "mysteryEncountersByBiome", "get").mockReturnValue(
      new Map<Biome, MysteryEncounterType[]>([
        [Biome.FOREST, [MysteryEncounterType.STRAY_POKEMON]],
        [Biome.VOLCANO, [MysteryEncounterType.FIGHT_OR_FLIGHT]],
      ]),
    );
  });

  afterEach(() => {
    game.phaseInterceptor.restoreOg();
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  it("should have the correct properties", async () => {
    await game.runToMysteryEncounter(MysteryEncounterType.STRAY_POKEMON, defaultParty);

    expect(StrayPokemonEncounter.encounterType).toBe(MysteryEncounterType.STRAY_POKEMON);
    expect(StrayPokemonEncounter.encounterTier).toBe(MysteryEncounterTier.GREAT);
    expect(StrayPokemonEncounter.dialogue).toBeDefined();
    expect(StrayPokemonEncounter.dialogue.intro).toStrictEqual([{ text: `${namespace}:intro` }]);
    expect(StrayPokemonEncounter.dialogue.encounterOptionsDialogue?.title).toBe(`${namespace}:title`);
    expect(StrayPokemonEncounter.dialogue.encounterOptionsDialogue?.description).toBe(`${namespace}:description`);
    expect(StrayPokemonEncounter.dialogue.encounterOptionsDialogue?.query).toBe(`${namespace}:query`);
    expect(StrayPokemonEncounter.options.length).toBe(4);
  });

  it("should not spawn outside of the forest biome", async () => {
    game.override.mysteryEncounterTier(MysteryEncounterTier.GREAT);
    game.override.startingBiome(Biome.VOLCANO);
    await game.runToMysteryEncounter();

    expect(scene.currentBattle?.mysteryEncounter?.encounterType).not.toBe(MysteryEncounterType.STRAY_POKEMON);
  });

  it("should initialize fully", async () => {
    initSceneWithoutEncounterPhase(scene, defaultParty);
    scene.currentBattle.mysteryEncounter = new MysteryEncounter(StrayPokemonEncounter);
    const encounter = scene.currentBattle.mysteryEncounter!;
    scene.currentBattle.waveIndex = defaultWave;

    const { onInit } = encounter;

    expect(encounter.onInit).toBeDefined();

    encounter.populateDialogueTokensFromRequirements();
    const onInitResult = onInit!();
    expect(onInitResult).toBe(true);

    const config = encounter.enemyPartyConfigs[0];

    expect(config.pokemonConfigs).toBeDefined();
    expect(config.pokemonConfigs![0]).toEqual(
      expect.objectContaining({
        species: getPokemonSpecies(Species.SEISMITOAD),
        isBoss: true,
        moveSet: [Moves.WATERFALL, Moves.EARTHQUAKE, Moves.DRAIN_PUNCH, Moves.ICE_PUNCH],
      }),
    );
  });

  describe("Option 1 - Enter", () => {
    it("should have the correct properties", () => {
      const option = StrayPokemonEncounter.options[0];
      expect(option.optionMode).toBe(MysteryEncounterOptionMode.DEFAULT);
      expect(option.dialogue).toBeDefined();
      expect(option.dialogue).toStrictEqual({
        buttonLabel: `${namespace}:option.1.label`,
        buttonTooltip: `${namespace}:option.1.tooltip`,
        selected: [
          {
            text: `${namespace}:option.1.selected`,
          },
        ],
      });
    });

    it("should start battle against the trainer with correctly loaded assets", async () => {
      await game.runToMysteryEncounter(MysteryEncounterType.STRAY_POKEMON, defaultParty);

      let successfullyLoaded = false;
      vi.spyOn(scene, "getEnemyParty").mockImplementation(() => {
        const ace = scene.currentBattle?.enemyParty[0];
        if (ace) {
          // Pretend that loading assets takes an extra 500ms
          vi.spyOn(ace, "loadAssets").mockImplementation(
            () =>
              new Promise(resolve => {
                setTimeout(() => {
                  successfullyLoaded = true;
                  resolve();
                }, 500);
              }),
          );
        }

        return scene.currentBattle?.enemyParty ?? [];
      });

      await runMysteryEncounterToEnd(game, 1, undefined, true);
      // Check that assets are successfully loaded
      expect(successfullyLoaded).toBe(true);

      // Check usual battle stuff
      expect(scene.getCurrentPhase()?.constructor.name).toBe(CommandPhase.name);
      expect(scene.currentBattle.mysteryEncounter?.encounterMode).toBe(MysteryEncounterMode.BOSS_BATTLE);
    });
  });

  describe("Option 2 - Leave", () => {
    it("should have the correct properties", () => {
      const option = StrayPokemonEncounter.options[1];
      expect(option.optionMode).toBe(MysteryEncounterOptionMode.DISABLED_OR_SPECIAL);
      expect(option.dialogue).toBeDefined();
      expect(option.dialogue).toStrictEqual({
        buttonLabel: `${namespace}:option.2.label`,
        buttonTooltip: `${namespace}:option.2.tooltip`,
        disabledButtonTooltip: `${namespace}:option.2.disabled_tooltip`,
        selected: [
          {
            text: `${namespace}:option.2.selected`,
          },
        ],
      });
    });

    it("Should NOT be selectable when requirements are not met", async () => {
      await game.runToMysteryEncounter(MysteryEncounterType.STRAY_POKEMON, defaultParty);
      // Mock movesets
      scene.getPlayerParty().forEach(p => (p.moveset = []));
      await game.phaseInterceptor.to(MysteryEncounterPhase, false);

      const encounterPhase = scene.getCurrentPhase();
      expect(encounterPhase?.constructor.name).toBe(MysteryEncounterPhase.name);
      const mysteryEncounterPhase = encounterPhase as MysteryEncounterPhase;
      vi.spyOn(mysteryEncounterPhase, "continueEncounter");
      vi.spyOn(mysteryEncounterPhase, "handleOptionSelect");
      vi.spyOn(scene.ui, "playError");

      await runSelectMysteryEncounterOption(game, 2);

      expect(scene.getCurrentPhase()?.constructor.name).toBe(MysteryEncounterPhase.name);
      expect(scene.ui.playError).not.toHaveBeenCalled(); // No error sfx, option is disabled
      expect(mysteryEncounterPhase.handleOptionSelect).not.toHaveBeenCalled();
      expect(mysteryEncounterPhase.continueEncounter).not.toHaveBeenCalled();
    });

    it("should be selectable when requirements met and should leave encounter without battle", async () => {
      const leaveEncounterWithoutBattleSpy = vi.spyOn(EncounterPhaseUtils, "leaveEncounterWithoutBattle");

      await game.runToMysteryEncounter(MysteryEncounterType.STRAY_POKEMON, defaultParty);
      await game.phaseInterceptor.to(MysteryEncounterPhase, false);

      const encounterPhase = scene.getCurrentPhase();
      expect(encounterPhase?.constructor.name).toBe(MysteryEncounterPhase.name);
      const mysteryEncounterPhase = encounterPhase as MysteryEncounterPhase;
      vi.spyOn(mysteryEncounterPhase, "handleOptionSelect");

      scene.getPlayerParty()[0].moveset = [new PokemonMove(Moves.PROTECT)];

      await runMysteryEncounterToEnd(game, 2);

      expect(leaveEncounterWithoutBattleSpy).toBeCalled();
      expect(mysteryEncounterPhase.handleOptionSelect).toBeCalled();
    });
  });

  describe("Option 3 - Enter", () => {
    it("should have the correct properties", () => {
      const option = StrayPokemonEncounter.options[2];
      expect(option.optionMode).toBe(MysteryEncounterOptionMode.DISABLED_OR_SPECIAL);
      expect(option.dialogue).toBeDefined();
      expect(option.dialogue).toStrictEqual({
        buttonLabel: `${namespace}:option.3.label`,
        buttonTooltip: `${namespace}:option.3.tooltip`,
        disabledButtonTooltip: `${namespace}:option.3.disabled_tooltip`,

        selected: [
          {
            text: `${namespace}:option.3.selected`,
          },
        ],
      });
    });

    it("Should NOT be selectable when requirements are not met", async () => {
      await game.runToMysteryEncounter(MysteryEncounterType.STRAY_POKEMON, defaultParty);
      // Mock movesets
      scene.getPlayerParty().forEach(p => (p.moveset = []));
      await game.phaseInterceptor.to(MysteryEncounterPhase, false);

      const encounterPhase = scene.getCurrentPhase();
      expect(encounterPhase?.constructor.name).toBe(MysteryEncounterPhase.name);
      const mysteryEncounterPhase = encounterPhase as MysteryEncounterPhase;
      vi.spyOn(mysteryEncounterPhase, "continueEncounter");
      vi.spyOn(mysteryEncounterPhase, "handleOptionSelect");
      vi.spyOn(scene.ui, "playError");

      await runSelectMysteryEncounterOption(game, 3);

      expect(scene.getCurrentPhase()?.constructor.name).toBe(MysteryEncounterPhase.name);
      expect(scene.ui.playError).not.toHaveBeenCalled(); // No error sfx, option is disabled
      expect(mysteryEncounterPhase.handleOptionSelect).not.toHaveBeenCalled();
      expect(mysteryEncounterPhase.continueEncounter).not.toHaveBeenCalled();
    });

    it("should be selectable when requirements met", async () => {
      await game.runToMysteryEncounter(MysteryEncounterType.STRAY_POKEMON, defaultParty);

      await game.phaseInterceptor.to(MysteryEncounterPhase, false);
      const encounterPhase = scene.getCurrentPhase();
      expect(encounterPhase?.constructor.name).toBe(MysteryEncounterPhase.name);
      // Mock moveset
      scene.getPlayerParty()[0].moveset = [new PokemonMove(Moves.FOLLOW_ME)];
      await runMysteryEncounterToEnd(game, 3, undefined, true);
    });
  });
  
  describe("Option 4 - Enter", () => {
    it("should have the correct properties", () => {
      const option = StrayPokemonEncounter.options[3];
      expect(option.optionMode).toBe(MysteryEncounterOptionMode.DISABLED_OR_SPECIAL);
      expect(option.dialogue).toBeDefined();
      expect(option.dialogue).toStrictEqual({
        buttonLabel: `${namespace}:option.4.label`,
        buttonTooltip: `${namespace}:option.4.tooltip`,

        selected: [
          {
            text: `${namespace}:option.4.selected`,
          },
        ],
      });
    });

    it("should have fastest pokemon leave party and enter battle", async () => {
      await game.runToMysteryEncounter(MysteryEncounterType.STRAY_POKEMON, defaultParty);
      const config = game.scene.currentBattle.mysteryEncounter!.enemyPartyConfigs[0];
      const speciesToSpawn = config.pokemonConfigs?.[0].species.speciesId;
      const partyCountBefore = scene.getPlayerParty().length;

      await runMysteryEncounterToEnd(game, 4, undefined, true);

      const enemyField = scene.getEnemyField();
      expect(scene.getCurrentPhase()?.constructor.name).toBe(CommandPhase.name);
      expect(enemyField.length).toBe(1);
      const partyCountAfter = scene.getPlayerParty().length;
      expect(partyCountBefore - 1).toBe(partyCountAfter);
      expect(enemyField.length).toBe(1);
      expect(enemyField[0].species.speciesId).toBe(speciesToSpawn);
    });
  });
});
