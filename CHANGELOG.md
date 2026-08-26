# Changelog

## [0.7.3] - 2026-08-25

### Changed
- Update clayjs



## [0.7.2] - 2026-08-23

### Changed
- Listeners now receive the causing frame



## [0.7.1] - 2026-08-23

### Changed
- Update the vendored clayjs build

### Fixed
- Give the conformance hooks a realistic timeout so they no longer fail on slow runs
- Bound the CI job runtime and unblock the browser install on Node 26



## [0.7.0] - 2026-08-22

### Changed
- Update quickcrop vendor to v1.1.0
- Update clayjs

### Fixed
- Split autosave and dirty-check comparison baselines



## [Unreleased]

### Changed
- License: relicensed to MIT-0 (MIT No Attribution). Same rights, attribution no longer required for our code; vendored third-party files keep their original licenses (see THIRD-PARTY-NOTICES.md).

## [0.6.1] - 2026-08-19

### Changed
- Update hypercms vendor bundle
- Update clayjs



## [0.6.0] - 2026-08-18

### Changed
- Update clayjs

### Fixed
- Skip strip-from-comparison regions in the dirty gate



## [0.5.0] - 2026-08-17

### Added
- Scoped live sync so dirty regions survive incoming peer and disk frames

### Changed
- Updated the clayjs bundle
- Updated the hypercms vendor bundle

### Fixed
- Blockers in scoped live sync found during final review



## [0.4.3] - 2026-08-15

### Added
- CI test runs on Node 26



## [0.4.2] - 2026-08-15

### Changed
- Update clayjs



## [0.4.1] - 2026-08-14

### Changed
- Update clayjs



## [0.4.0] - 2026-08-12

### Added
- `clay.addDocumentTransform` for modifying the document before save

### Changed
- Updated clayjs

### Breaking Changes
- Removed the `window.hyperclay` compatibility shim


