import { expect, test } from "vitest";
import { advertisingScreens, isReservedInstitutionScreen, screenUseOf, showsAdvertisingArea } from "../app/lib/screen-use-policy";

test("institution screens are reserved unless the owner opts in", () => {
  expect(screenUseOf({ institutionId: "USR-CIVIC", advertisingOptIn: false })).toBe("institution");
  expect(screenUseOf({ institutionId: "USR-CIVIC" })).toBe("institution");
  expect(screenUseOf({ institutionId: "USR-CIVIC", advertisingOptIn: true })).toBe("advertising");
  expect(isReservedInstitutionScreen({ institutionId: "USR-CIVIC", advertisingOptIn: false })).toBe(true);
});

test("marketplace screens without an institution are always open to advertising", () => {
  expect(screenUseOf({ institutionId: null, advertisingOptIn: false })).toBe("advertising");
  expect(isReservedInstitutionScreen({ institutionId: undefined })).toBe(false);
});

test("the Advertising area shows for an opened screen or remaining booking history", () => {
  const reserved = { institutionId: "USR-CIVIC", advertisingOptIn: false };
  const opened = { institutionId: "USR-CIVIC", advertisingOptIn: true };
  expect(advertisingScreens([reserved, opened])).toEqual([opened]);
  expect(showsAdvertisingArea([reserved], [])).toBe(false);
  expect(showsAdvertisingArea([reserved, opened], [])).toBe(true);
  expect(showsAdvertisingArea([reserved], [{ status: "completed" }])).toBe(true);
});
