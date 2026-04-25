export const REPORT_FIGHTS_AND_ACTORS = `
query ReportFightsAndActors($code: String!) {
  reportData {
    report(code: $code) {
      title
      startTime
      fights(killType: Wipes) {
        id
        name
        startTime
        endTime
        kill
      }
      masterData {
        actors {
          id
          name
          subType
          type
          petOwner
        }
      }
    }
  }
}
`;

export const PLAYER_INFO_IN_FIGHT = `
query PlayerInfoInFight($code: String!, $fightIDs: [Int!]) {
  reportData {
    report(code: $code) {
      playerDetails(fightIDs: $fightIDs)
      events(fightIDs: $fightIDs, dataType: CombatantInfo, limit: 10000) {
        data
      }
    }
  }
}
`;

export const INTERRUPT_AND_CAST_EVENTS = `
query InterruptAndCastEvents($code: String!, $startTime: Float!, $endTime: Float!) {
  reportData {
    report(code: $code) {
      castEvents: events(
        startTime: $startTime,
        endTime: $endTime,
        dataType: Casts,
        hostilityType: Friendlies,
        limit: 10000
      ) {
        data
      }
      interruptEvents: events(
        startTime: $startTime,
        endTime: $endTime,
        dataType: Interrupts,
        hostilityType: Friendlies,
        limit: 10000
      ) {
        data
      }
    }
  }
}
`;
