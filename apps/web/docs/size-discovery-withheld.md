# Size discovery: withheld state

The fitting room and lab accept the existing `/api/size-garment?body=?&slot=?` array entries unchanged. Sprint 3.6 may include `{ "size": "L", "status": "withheld" }` for a size that is not ready. A withheld entry needs no fit map or asset URLs. Available entries retain `size`, `fit`, `glb`, and `sidecar`; an optional `status: "available"` is accepted.

Withheld sizes cannot be selected, recommended, or used for an asset fetch. If a saved or recommended size is withheld, the picker selects an available size using the existing priority. Duplicate entries resolve conservatively: withheld wins. Missing sizes retain their existing disabled behavior. The server remains responsible for gate decisions and for refusing direct asset requests when an asset is withheld; this change does not withhold any existing sizes or change the default generation.
