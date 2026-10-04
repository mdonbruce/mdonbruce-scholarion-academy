import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { educatorVM, productVM } from "../src/bff/views";
import { catalog } from "../src/platform";
import { LEAD_FACULTY } from "../src/brand/faculty";

describe("Lead Faculty on the website", () => {
  it("has a profile page with the approved photo, and the academy educator page links to it", () => {
    const vm = educatorVM(LEAD_FACULTY.slug)!;
    assert.ok(vm);
    assert.equal(vm.faculty?.photo.src, LEAD_FACULTY.photo.src);
    assert.equal(vm.name, "Dr. Martins Donbruce Idahosa");
    assert.ok(vm.programs.length + vm.courses.length > 0);
    const academy = educatorVM(catalog.educatorSlug("Scholarion Academy"))!;
    assert.equal(academy.leadFaculty?.slug, LEAD_FACULTY.slug);
  });

  it("course pages credit Scholarion Academy and show the Lead Faculty with the photo", () => {
    const p = catalog.all()[0];
    const vm = productVM(p.slug, null)!;
    assert.equal(vm.product.educator, "Scholarion Academy");
    assert.equal(vm.leadFaculty?.href, `/educators/${LEAD_FACULTY.slug}`);
    assert.equal(vm.leadFaculty?.photo.width, 127);
  });
});
