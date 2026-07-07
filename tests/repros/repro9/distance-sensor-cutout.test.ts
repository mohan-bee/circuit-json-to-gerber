import { expect, test } from "bun:test"
import type { AnyCircuitElement } from "circuit-json"
import {
  convertSoupToExcellonDrillCommands,
  stringifyExcellonDrill,
} from "src/excellon-drill"
import { convertSoupToGerberCommands } from "src/gerber/convert-soup-to-gerber-commands"
import { stringifyGerberCommandLayers } from "src/gerber/stringify-gerber"
import { maybeOutputGerber } from "tests/fixtures/maybe-output-gerber"
import distanceSensorJson from "./distance-sensor.json"

const getCoordinateExtents = (commands: readonly unknown[]) => {
  const xs = commands.flatMap((command) =>
    command &&
    typeof command === "object" &&
    "x" in command &&
    typeof command.x === "number"
      ? [command.x]
      : [],
  )
  const ys = commands.flatMap((command) =>
    command &&
    typeof command === "object" &&
    "y" in command &&
    typeof command.y === "number"
      ? [command.y]
      : [],
  )

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

test("repro9 distance sensor cutouts", async () => {
  const circuitJson = distanceSensorJson as AnyCircuitElement[]

  const gerberCmds = convertSoupToGerberCommands(circuitJson)
  const excellonDrillCmdsPlated = convertSoupToExcellonDrillCommands({
    circuitJson,
    is_plated: true,
  })
  const excellonDrillCmdsUnplated = convertSoupToExcellonDrillCommands({
    circuitJson,
    is_plated: false,
  })

  const gerberOutput = stringifyGerberCommandLayers(gerberCmds)
  const excellonDrillOutputPlated = stringifyExcellonDrill(
    excellonDrillCmdsPlated,
  )
  const excellonDrillOutputUnplated = stringifyExcellonDrill(
    excellonDrillCmdsUnplated,
  )

  const board = circuitJson.find((element) => element.type === "pcb_board")
  if (!board || !("outline" in board) || !board.outline?.length) {
    throw new Error("Expected repro9 fixture to include a board outline")
  }

  const boardExtents = getCoordinateExtents(board.outline)
  const edgeCutExtents = getCoordinateExtents(gerberCmds.Edge_Cuts)
  const epsilon = 1e-9

  expect(edgeCutExtents.minX).toBeGreaterThanOrEqual(
    boardExtents.minX - epsilon,
  )
  expect(edgeCutExtents.maxX).toBeLessThanOrEqual(boardExtents.maxX + epsilon)
  const edgeCutArcCommands = gerberCmds.Edge_Cuts.filter(
    (command) =>
      command.command_code === "D01" &&
      "i" in command &&
      "j" in command &&
      command.i === 0 &&
      Math.abs(Math.abs(command.j ?? 0) - 1.651) < epsilon,
  )
  expect(edgeCutArcCommands).toHaveLength(2)

  await maybeOutputGerber(gerberOutput, excellonDrillOutputPlated)

  expect({
    ...gerberOutput,
    "drill_plated.drl": excellonDrillOutputPlated,
    "drill_unplated.drl": excellonDrillOutputUnplated,
  }).toMatchGerberSnapshot(import.meta.path, "distance-sensor-cutout")
})
