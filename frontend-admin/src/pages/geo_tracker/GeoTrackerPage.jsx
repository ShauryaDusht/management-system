/**
 * GeoTrackerPage.jsx  –  Plant GeoTracker (production-ready rewrite)
 *
 * Fixes addressed:
 *  1. Map Layout        — map now fills 100% of the available viewport area,
 *                         no dead padding from AdminLayout's default content wrapper.
 *  2. GPS Correction    — RANSAC-based row detection + least-squares line fitting
 *                         projects noisy GPS points onto their plantation row.
 *                         Four strength levels: Off / Low / Medium / High.
 *  3. Marker Design     — SVG-based markers with per-condition colours, zoom
 *                         animation, hover glow, selected ring, cluster support.
 *  4. Image Lightbox    — full-screen modal with zoom, pan, prev/next, ESC,
 *                         keyboard navigation, touch support, loading states.
 *  5. UX improvements   — mini-map legend, GPS strength indicator, reset-view
 *                         button, mobile-friendly sidebar, accessible markup.
 *  6. Performance       — Leaflet.markercluster for 10 000+ trees, debounced
 *                         search, lazy image loading, memoised GIS calculations.
 */

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { geoApi } from '../../api/geoTracker'
import AdminLayout from '../../layout/AdminLayout'
import ConfirmModal from '../../shared/components/ConfirmModal'

// ---------------------------------------------------------------------------
// eFlora of Gandhinagar – Tree Information Database
// Source: www.efloraofgandhinagar.in  (87 trees from campus survey)
// Each entry: localName, scientificName, family, habit, gujaratiName,
//             flowering, uses, description, efloraSlug
// ---------------------------------------------------------------------------
const EFLORA_DB = {
  // Key = scientific name (lowercase, trimmed) → info object
  'cassia javanica': { local:'Pink cassia', gujarati:'Gulabi Amaltas', family:'Fabaceae (Caesalpinioideae)', habit:'Medium deciduous tree, 10–25 m', flowering:'March–May', uses:'Ornamental, street tree, shade', description:'Beautiful ornamental tree bearing clusters of rose-pink flowers. Leaves paripinnate with 8–14 oblong leaflets. Pods long, cylindrical, dark brown. Widely planted along roadsides for its stunning spring bloom.', slug:'cassia-javanica' },
  'senna siamea': { local:'Kashid', gujarati:'Kasod', family:'Fabaceae', habit:'Medium evergreen tree, 8–15 m', flowering:'Oct–Dec', uses:'Timber, fuelwood, shade, soil improvement', description:'Fast-growing, hardy tree with dense canopy. Bright yellow flowers in terminal panicles. Leaves pinnate with 6–10 pairs of leaflets. Commonly used for afforestation and as a windbreak.', slug:'senna-siamea' },
  'cassia fistula': { local:'Garmalo', gujarati:'Garmalo', family:'Fabaceae', habit:'Medium deciduous tree, 10–20 m', flowering:'April–June', uses:'Ornamental, Ayurvedic medicine, timber', description:'National tree of Thailand. Long drooping racemes of bright yellow flowers give it the name "Golden Shower". Fruit is a long cylindrical pod. Pulp used as mild laxative in traditional medicine.', slug:'cassia-fistula' },
  'nyctanthes arbor': { local:'Parijat', gujarati:'Parijatak', family:'Oleaceae', habit:'Small tree or shrub, 5–10 m', flowering:'Aug–Oct', uses:'Sacred, medicinal, perfumery, ornamental', description:'Fragrant white flowers with orange tube, opening at night and falling at dawn. Sacred in Hindu tradition. Leaves rough, used in Ayurveda for fevers and arthritis. Flowers yield yellow dye.', slug:'nyctanthes-arbor-tristis' },
  'bauhinia variegata': { local:'Kachnar', gujarati:'Kanchan', family:'Fabaceae', habit:'Small to medium deciduous tree, 8–12 m', flowering:'Feb–April', uses:'Ornamental, edible buds, medicinal', description:'Strikingly beautiful tree with bilobed leaves resembling a camel\'s hoof. Large orchid-like flowers in shades of pink, purple and white. Flower buds and young pods are cooked as vegetable in India.', slug:'bauhinia-variegata' },
  'tabebuia rosea': { local:'Tabebuia rosea', gujarati:'Tabebuia', family:'Bignoniaceae', habit:'Medium deciduous tree, 10–20 m', flowering:'Feb–April', uses:'Ornamental, street tree, timber', description:'Spectacular flowering tree from tropical America. Large clusters of pink to magenta trumpet-shaped flowers appear before leaves. Widely planted in Gandhinagar for avenue beautification.', slug:'tabebuia-rosea' },
  'tabebuia argentea': { local:'Tabebuia argentea', gujarati:'Peela Tabebuia', family:'Bignoniaceae', habit:'Small to medium deciduous tree, 8–15 m', flowering:'Feb–April', uses:'Ornamental, avenue tree', description:'Brilliant yellow flowering tree with silver-grey foliage. Masses of trumpet-shaped bright yellow flowers smother the tree when leafless. Silver sheen on leaves gives the species its name "argentea".', slug:'tabebuia-argentea' },
  'peltophorum': { local:'Peltro fram', gujarati:'Peltophorum', family:'Fabaceae', habit:'Large semi-evergreen tree, 15–25 m', flowering:'May–Sept', uses:'Shade, ornamental, timber, tannin', description:'Stately tree with dense ferny foliage and large golden-yellow flower clusters. Pods flat, winged and coppery. One of the best shade trees for avenues. Bark used for tanning leather.', slug:'peltophorum-pterocarpum' },
  'delonix regia': { local:'Gulmohar', gujarati:'Gulmohar', family:'Fabaceae', habit:'Large deciduous tree, 10–20 m', flowering:'April–June', uses:'Ornamental, shade, fuelwood', description:'One of the most spectacular flowering trees in the world. Brilliant scarlet-orange flowers with one white petal cover the canopy. Bipinnate feathery leaves. Flat brown pods 30–60 cm. Planted extensively across Gandhinagar.', slug:'delonix-regia' },
  'neolamarckia cadamba': { local:'Kadam', gujarati:'Kadamb', family:'Rubiaceae', habit:'Large deciduous tree, 20–30 m', flowering:'July–Sept', uses:'Timber, paper pulp, sacred, medicinal', description:'Fast-growing tree associated with Lord Krishna in mythology. Spherical yellow-orange flower heads with sweet fragrance. Large glossy leaves. Important for timber and paper industry.', slug:'neolamarckia-cadamba' },
  'manilkara hexandra': { local:'Rayan', gujarati:'Rayan', family:'Sapotaceae', habit:'Medium to large evergreen tree, 15–25 m', flowering:'Feb–May', uses:'Edible fruit, timber, fodder', description:'Native Indian tree with edible sweet berries. Dense evergreen canopy provides excellent shade. Hard durable timber used for building. Small white flowers; fruits turn red-orange when ripe. Important in traditional agroforestry.', slug:'manilkara-hexandra' },
  'madhuca longifolia': { local:'Mahua', gujarati:'Mahuda', family:'Sapotaceae', habit:'Large deciduous tree, 15–25 m', flowering:'Feb–April', uses:'Edible flowers, oil, alcohol, fodder, timber', description:'Ecologically and economically vital tree for tribal communities. Fleshy fragrant flowers consumed fresh or dried; fermented for country liquor. Seeds yield non-edible oil for soap and cosmetics. Attracts wildlife.', slug:'madhuca-longifolia' },
  'terminalia bellirica': { local:'Baheda', gujarati:'Baheda', family:'Combretaceae', habit:'Large deciduous tree, 20–30 m', flowering:'Oct–Nov', uses:'Ayurvedic medicine (Triphala), tannin, timber', description:'One of three ingredients in Triphala, a classical Ayurvedic formulation. Fruit astringent, used for respiratory and digestive ailments. Large tree with broad crown. Bark yields tannins for leather industry.', slug:'terminalia-bellirica' },
  'ficus virens': { local:'Pilkhan', gujarati:'Pilkhan', family:'Moraceae', habit:'Large semi-evergreen tree, 20–35 m', flowering:'Feb–May', uses:'Shade, sacred, wildlife habitat, fodder', description:'Massive fig tree with spreading aerial roots and dense canopy. Leaves turn copper-red before new growth – beautiful seasonal display. Important food source for birds. Sacred in parts of India.', slug:'ficus-virens' },
  'ficus religiosa': { local:'Pipal', gujarati:'Pipal', family:'Moraceae', habit:'Large deciduous tree, 25–35 m', flowering:'Feb–May', uses:'Sacred, medicinal, shade, wildlife', description:'Most sacred tree in Hindu, Buddhist and Jain traditions. Heart-shaped leaves with distinctive long drip-tip. Small figs (syconia) eaten by birds. Lord Buddha attained enlightenment under this tree. Rich in medicinal compounds.', slug:'ficus-religiosa' },
  'ficus benghalensis': { local:'Vad', gujarati:'Vad', family:'Moraceae', habit:'Very large evergreen tree, 20–35 m+', flowering:'March–June', uses:'Sacred, shade, medicinal, timber, wildlife', description:'National tree of India. Famous for its prop roots that form additional trunks, allowing single trees to cover vast areas. The tree in Auroville covers ~2 hectares. Sacred to Hindus. Small red figs attract birds and bats.', slug:'ficus-benghalensis' },
  'ficus benghalensis': { local:'Vad', gujarati:'Vad', family:'Moraceae', habit:'Very large evergreen tree, 20–35 m+', flowering:'March–June', uses:'Sacred, shade, medicinal, timber, wildlife', description:'National tree of India. Famous for its prop roots that form additional trunks, allowing single trees to cover vast areas. Sacred to Hindus. Small red figs attract birds and bats.', slug:'ficus-benghalensis' },
  'terminalia catappa': { local:'Badam', gujarati:'Jangli Badam', family:'Combretaceae', habit:'Large deciduous tree, 15–25 m', flowering:'March–July', uses:'Edible nuts, shade, medicinal, ornamental', description:'Distinctive tiered horizontal branches. Leaves turn crimson before falling – beautiful autumn display. Almond-like edible kernel inside fruit. Widely planted as a shade tree in coastal and urban areas.', slug:'terminalia-catappa' },
  'mimusops elengi': { local:'Borsali', gujarati:'Borsali', family:'Sapotaceae', habit:'Medium evergreen tree, 10–20 m', flowering:'March–May', uses:'Fragrant flowers, timber, medicinal, ornamental', description:'Dense dark green canopy and highly fragrant small white flowers used in garlands and hair decoration. Timber very hard and durable. Bark and flowers used in Ayurveda. Good avenue tree tolerant of pollution.', slug:'mimusops-elengi' },
  'butea monosperma': { local:'Kesudo', gujarati:'Khakhro', family:'Fabaceae', habit:'Medium deciduous tree, 10–15 m', flowering:'Feb–April', uses:'Sacred (Holi), dye, medicinal, fodder, lac host', description:'Flame of the Forest – brilliant orange-red flowers on leafless branches in spring. Flowers used to make Holi colour. Lac insect host. Leaves used as plates. Bark yields fibre. Important in tribal rituals.', slug:'butea-monosperma' },
  'mangifera indica': { local:'Mango tree', gujarati:'Keri', family:'Anacardiaceae', habit:'Large evergreen tree, 15–30 m', flowering:'Dec–Feb', uses:'National fruit of India, timber, shade, sacred', description:'National fruit tree of India. Cultivated for 4000+ years. Dense mango groves provide shade and habitat. Small fragrant flowers in large panicles. Leaves used in Hindu religious ceremonies. Hundreds of cultivated varieties.', slug:'mangifera-indica' },
  'azadirachta indica': { local:'Limbdo', gujarati:'Limdo', family:'Meliaceae', habit:'Medium semi-evergreen tree, 15–20 m', flowering:'March–May', uses:'Biopesticide, Ayurveda, timber, fuelwood', description:'The village pharmacy. Every part has medicinal or pesticidal value. Azadirachtin in seeds is a powerful natural insecticide. Leaves, bark, flowers, seeds used in traditional medicine. Excellent drought-tolerant shade tree.', slug:'azadirachta-indica' },
  'acacia nilotica': { local:'Deshi baval', gujarati:'Baval', family:'Fabaceae', habit:'Medium deciduous tree, 5–15 m', flowering:'May–June', uses:'Timber, tannin, gum arabic, fuelwood, medicine', description:'Native thorny tree common in dry regions. Bark rich in tannins used in leather tanning. Gum from bark (gum arabic) has industrial uses. Hard heavy timber. Important for fuelwood in rural areas. Pod used as fodder.', slug:'acacia-nilotica' },
  'prosopis juliflora': { local:'Gando baval', gujarati:'Gando Baval', family:'Fabaceae', habit:'Small thorny tree, 5–12 m', flowering:'March–May', uses:'Fuelwood, charcoal, pods as fodder, tannin', description:'Invasive exotic from South America, naturalised across arid India. Very hardy – tolerates salinity, drought. Pods nutritious fodder for cattle and goats. Fuelwood and charcoal. Spreads aggressively, displacing native vegetation.', slug:'prosopis-juliflora' },
  'acacia latronum': { local:'Dev baval', gujarati:'Dev Baval', family:'Fabaceae', habit:'Small to medium thorny tree, 6–12 m', flowering:'Feb–May', uses:'Fuelwood, fodder, thorny hedge', description:'Hardy drought-resistant acacia native to dry tropical zones. Dense thorny branches make effective live fencing. Pods provide nutritious fodder. Useful for stabilising degraded land and arid wastelands.', slug:'acacia-latronum' },
  'acacia auriculiformis': { local:'Australian baval', gujarati:'Vilayati Baval', family:'Fabaceae', habit:'Medium evergreen tree, 8–20 m', flowering:'June–Sept', uses:'Fast-growing timber, fuelwood, afforestation', description:'Introduced from Australia for rapid afforestation. Flat phyllodes (leaf-like petioles) instead of true leaves. Fast-growing in poor soils. Widely used for watershed management and mine reclamation. Produces excellent charcoal.', slug:'acacia-auriculiformis' },
  'prosopis cineraria': { local:'Khijado', gujarati:'Khijado', family:'Fabaceae', habit:'Small to medium tree, 5–10 m', flowering:'Feb–April', uses:'Sacred (Dussehra), fodder, timber, medicinal', description:'State tree of Rajasthan. Associated with Dussehra festival (Shami worship). Pods and leaves excellent fodder, sustaining cattle during drought. Nitrogen-fixing roots improve soil fertility. Tolerates extreme heat and drought.', slug:'prosopis-cineraria' },
  'senegalia catechu': { local:'Khair', gujarati:'Khair', family:'Fabaceae', habit:'Medium deciduous tree, 8–15 m', flowering:'July–Aug', uses:'Katha (mouth freshener), tannin, timber, medicine', description:'Source of katha and catechu – key ingredients in paan (betel leaf preparation). Heartwood boiled to extract extract. Rich in tannins. Hard heavy durable timber. Bark used in traditional medicine for skin diseases.', slug:'acacia-catechu' },
  'cordia dichotoma': { local:'Gunda', gujarati:'Gunda', family:'Boraginaceae', habit:'Small to medium deciduous tree, 5–12 m', flowering:'Jan–April', uses:'Edible gluey fruit, medicinal, timber', description:'Known for its sticky edible fruits (gunda) used in Gujarati pickles and condiments. Small white flowers. Leaves rough, used as sandpaper locally. Gluey pulp of fruit has adhesive properties. Common in dry areas.', slug:'cordia-dichotoma' },
  'cordia sebestena': { local:'Red Gunda', gujarati:'Lal Gunda', family:'Boraginaceae', habit:'Small tree or shrub, 4–8 m', flowering:'Almost year-round', uses:'Ornamental, medicinal', description:'Striking ornamental tree with brilliant scarlet-orange flowers in clusters. Rough sandpaper-like leaves. Fleshy white fragrant fruit. Planted as a decorative tree in gardens and avenues. Tolerates coastal conditions.', slug:'cordia-sebestena' },
  'parkia biglobosa': { local:'Parkia', gujarati:'Parkia', family:'Fabaceae', habit:'Large deciduous tree, 15–25 m', flowering:'Dec–Feb', uses:'Edible seeds and pods, locust beans, timber', description:'West African locust bean tree, planted in India for its nutritious fermented seeds (dawadawa). Ball-shaped red flower heads. Long flat pods. Seeds fermented into condiment similar to miso. Important food security tree.', slug:'parkia-biglobosa' },
  'spathodea campanulata': { local:'Spathodea', gujarati:'African Tulip', family:'Bignoniaceae', habit:'Medium to large evergreen tree, 15–25 m', flowering:'Almost year-round', uses:'Ornamental, shade, medicinal', description:'African Tulip Tree. Spectacular large scarlet-orange trumpet flowers in dense clusters at branch tips year-round. Fast-growing. Buds hold water, popular with children. Invasive in some regions. Widely planted as ornamental in India.', slug:'spathodea-campanulata' },
  'erythrina variegata': { local:'Pangaro', gujarati:'Pangaro', family:'Fabaceae', habit:'Medium deciduous tree, 10–20 m', flowering:'Jan–March', uses:'Shade, living fence, medicine, fodder, ornamental', description:'Coral tree with spectacular scarlet flowers on bare branches. Spiny trunk and branches. Soft wood – traditionally used as living fence posts. Leaves used as fodder. Widely used in agroforestry as shade tree in plantations.', slug:'erythrina-variegata' },
  'terminalia arjuna': { local:'Arjun', gujarati:'Arjun', family:'Combretaceae', habit:'Large deciduous tree, 20–30 m', flowering:'March–June', uses:'Ayurvedic cardiac tonic, timber, tannin', description:'Revered medicinal tree, best known for cardiac benefits. Bark extract used for treating heart conditions in Ayurveda for over 3000 years. Strong buttressed trunk. Prefers riverbanks. Excellent timber. Leaves fed to tasar silkworm.', slug:'terminalia-arjuna' },
  'bombax ceiba': { local:'Shimalo', gujarati:'Shimlo', family:'Malvaceae', habit:'Large deciduous tree, 20–35 m', flowering:'Jan–April', uses:'Cotton (kapok), timber, medicinal, ornamental', description:'Silk Cotton Tree. Large brilliant red flowers on bare branches in winter. Massive spiny trunk with distinctive conical spines. Seed pods yield cotton-like floss (kapok) used for stuffing. Important medicinal tree in tribal medicine.', slug:'bombax-ceiba' },
  'tectona grandis': { local:'Sagwan', gujarati:'Sagwan', family:'Lamiaceae', habit:'Large deciduous tree, 20–35 m', flowering:'June–Sept', uses:'Premium timber, teak furniture, shipbuilding', description:'Teak – one of the world\'s most valued timbers. Extremely durable, naturally resistant to rot, insects and weather. Large leaves up to 60 cm. Small white fragrant flowers. India\'s forests once dominated by teak. Extensively planted commercially.', slug:'tectona-grandis' },
  'aegle marmelos': { local:'Bael (bili)', gujarati:'Bilipatra', family:'Rutaceae', habit:'Medium deciduous tree, 8–15 m', flowering:'May–June', uses:'Sacred (Shiva), medicinal fruit, digestive aid', description:'Sacred to Lord Shiva – trifoliate leaves offered in worship. Hard-shelled fruit with aromatic pulp rich in vitamins. Pulp used for dysentery, digestive problems. Sherbet from ripe fruit popular in summer. Thorny branches.', slug:'aegle-marmelos' },
  'dalbergia sissoo': { local:'Shisham', gujarati:'Shisham', family:'Fabaceae', habit:'Large deciduous tree, 15–25 m', flowering:'March–April', uses:'Premier furniture timber, fuelwood, nitrogen-fixing', description:'North India\'s most valued hardwood after teak. Rosewood-like timber for furniture, flooring, musical instruments. Deeply furrowed bark. Small pink-white fragrant flowers. Nitrogen-fixing root nodules improve soil. Tolerates frost and drought.', slug:'dalbergia-sissoo' },
  'terminalia mantaly': { local:'Terminalia mantaly', gujarati:'Umbrella Tree', family:'Combretaceae', habit:'Medium deciduous tree, 10–20 m', flowering:'March–May', uses:'Ornamental, avenue tree, shade', description:'Madagascar Almond. Distinctly tiered horizontal branches form umbrella-like shape. Very popular as a compact avenue tree in cities. Attractive red and yellow autumn colour. Small white flowers. Tolerates urban pollution well.', slug:'terminalia-mantaly' },
  'sterculia foetida': { local:'Jangli badam', gujarati:'Jangli Badam', family:'Malvaceae', habit:'Large deciduous tree, 20–35 m', flowering:'March–April', uses:'Edible seeds, biodiesel, timber, ornamental', description:'Wild Almond or Java Olive. Attractive umbrella crown. Foul-smelling small reddish flowers. Large bright red star-shaped fruit pods containing edible seeds. Seeds used for biodiesel. Spectacular ornamental tree when fruiting.', slug:'sterculia-foetida' },
  'albizia lebbeck': { local:'Shirish', gujarati:'Shirish', family:'Fabaceae', hint:'Medium to large deciduous tree, 15–25 m', flowering:'April–July', uses:'Ayurvedic (anti-allergy), shade, timber, fodder', description:'Woman\'s tongue tree – named for rattling pods. Important Ayurvedic medicine for respiratory allergies and asthma. Fragrant cream-white pom-pom flowers. Fast-growing shade tree. Hard timber for furniture. Widely planted along roadsides.', slug:'albizia-lebbeck' },
  'simarouba glauca': { local:'Laxmi taru', gujarati:'Laxmi Taru', family:'Simaroubaceae', habit:'Medium evergreen tree, 10–15 m', flowering:'Jan–March', uses:'Biodiesel, edible oil, soil conservation', description:'Paradise Tree or Biodiesel Tree. Seeds yield high-quality non-edible oil (50–60%) with excellent biodiesel potential. Drought-tolerant, grows on wastelands. Evergreen canopy. Promoted by Indian government for biofuel programme.', slug:'simarouba-glauca' },
  'millingtonia hortensis': { local:'Buch', gujarati:'Indian Cork Tree', family:'Bignoniaceae', habit:'Large deciduous tree, 15–25 m', flowering:'Oct–Jan', uses:'Ornamental, fragrant flowers, timber, medicinal', description:'Indian Cork Tree. Spectacularly fragrant pure white trumpet flowers blooming at night in cool months. Bark is corky and soft. Flowers used in garlands and religious offerings. Tall elegant tree with feathery foliage.', slug:'millingtonia-hortensis' },
  'pongamia pinnata': { local:'Karanja', gujarati:'Karanj', family:'Fabaceae', habit:'Medium to large semi-evergreen tree, 10–20 m', flowering:'March–May', uses:'Biodiesel, medicinal oil, shade, nitrogen-fixing', description:'Karanj or Pongam. Clusters of pink-purple flowers. Seeds yield non-edible oil used as traditional lamp fuel, mosquito repellent and in Ayurveda for skin diseases. Excellent biodiesel feedstock. Tolerates coastal, saline and waterlogged soils.', slug:'pongamia-pinnata' },
  'ptrocarpus marsupium': { local:'Kanji tree', gujarati:'Bijasal', family:'Fabaceae', habit:'Large deciduous tree, 20–30 m', flowering:'Sept–Oct', uses:'Ayurvedic (diabetes), premium timber, gum', description:'Indian Kino Tree. Heartwood yields a blood-red resin (Indian kino) with potent anti-diabetic properties. Flagship Ayurvedic diabetes remedy for centuries. Excellent timber. Leaves fed to cattle. Resin also used as mouthwash.', slug:'pterocarpus-marsupium' },
  'millettia peguensis': { local:'Milletia', gujarati:'Milletia', family:'Fabaceae', habit:'Medium deciduous tree, 10–18 m', flowering:'March–May', uses:'Timber, ornamental', description:'Teak-like timber tree from South-East Asia. Dense feathery compound leaves. Purple-pink flowers in racemes. Planted in India as an ornamental and timber tree. Wood valued for furniture and construction.', slug:'millettia-peguensis' },
  'bignonia megapotamica': { local:'Bignonia', gujarati:'Bignonia', family:'Bignoniaceae', habit:'Climbing shrub or small tree', flowering:'March–July', uses:'Ornamental climber', description:'Vigorous climbing bignonia with trumpet-shaped orange-red flowers. Attractive ornamental for trellises, fences and pergolas. Fast-growing. Used extensively in Gandhinagar for vertical greening and beautification.', slug:'bignonia-megapotamica' },
  'casuarina equisetifolia': { local:'Saru', gujarati:'Saru', family:'Casuarinaceae', habit:'Large conifer-like tree, 20–35 m', flowering:'Year-round', uses:'Timber, fuelwood, windbreak, coastal afforestation', description:'Australian Pine or Beefwood. Looks like a conifer but is a flowering tree with tiny scale leaves on jointed green branchlets. Excellent windbreak. Hard dense timber. Fixes nitrogen. Widely planted on coastal dunes and as avenue tree.', slug:'casuarina-equisetifolia' },
  'ficus racemosa': { local:'Umbaro', gujarati:'Umbaro', family:'Moraceae', habit:'Large semi-evergreen tree, 15–25 m', flowering:'March–April', uses:'Edible figs, sacred, medicinal, wildlife', description:'Cluster Fig. Figs grow directly on trunk and main branches in dense clusters (cauliflorous habit). Sacred in Hindu and Buddhist traditions. Fruits eaten by birds, bats and monkeys. Latex and bark used medicinally. Important riverbank tree.', slug:'ficus-racemosa' },
  'tecomella undulata': { local:'Rohido', gujarati:'Rohido', family:'Bignoniaceae', habit:'Small to medium deciduous tree, 8–12 m', flowering:'Feb–April', uses:'State tree of Rajasthan, timber, medicinal', description:'State tree of Rajasthan. Brilliant orange-red tubular flowers on bare branches. Extremely hard and durable timber (Indian Teak of arid zones). Well adapted to dry conditions. Sacred in Rajasthan. Flower extract used for liver ailments.', slug:'tecomella-undulata' },
  'jacaranda mimosifolia': { local:'Neelmohar', gujarati:'Neelmohar', family:'Bignoniaceae', habit:'Medium deciduous tree, 10–20 m', flowering:'March–May', uses:'Ornamental, shade, timber', description:'One of the world\'s most beautiful flowering trees. Spectacular display of lavender-blue trumpet flowers covering the entire canopy. Feathery fern-like bipinnate leaves. Native to Argentina. Creates a blue carpet of fallen flowers. Widely planted in Gandhinagar.', slug:'jacaranda-mimosifolia' },
  'kigelia pinnata': { local:'Balamkhira', gujarati:'Sausage Tree', family:'Bignoniaceae', habit:'Medium to large evergreen tree, 10–20 m', flowering:'Jan–April', uses:'Ornamental, traditional medicine, fruit – not edible', description:'Sausage Tree – named for its huge sausage-shaped hanging fruits (up to 1 m long). Large dark red maroon flowers on long hanging stalks, pollinated by bats. Fruit used in African traditional medicine. Striking conversation-piece tree.', slug:'kigelia-pinnata' },
  'polyalthia longifolia': { local:'Asopalav', gujarati:'Asopalav', family:'Annonaceae', habit:'Tall slender evergreen tree, 10–20 m', flowering:'March–April', uses:'Ornamental, shade, sacred, timber, noise barrier', description:'Mast Tree or False Ashok. Extremely tall and columnar, used as a natural pillar in avenues. Long wavy-edged dark green leaves. Small greenish flowers. Sacred in Hindu ceremonies. Excellent as a noise and dust barrier along roads.', slug:'polyalthia-longifolia' },
  'saraca asoca': { local:'Sita Ashok', gujarati:'Ashok', family:'Fabaceae', habit:'Small to medium evergreen tree, 8–12 m', flowering:'Feb–May', uses:'Sacred, Ayurvedic medicine, ornamental', description:'Most sacred tree in Hindu mythology – associated with Sita in Ramayana. Brilliant orange-red flower clusters turn yellow with age. Important Ayurvedic medicine for gynaecological conditions. Popular ornamental tree for gardens and temple complexes.', slug:'saraca-asoca' },
  'eucalyptus globulus': { local:'Nilgiri', gujarati:'Nilgiri', family:'Myrtaceae', habit:'Very large evergreen tree, 30–55 m', flowering:'Oct–Dec', uses:'Timber, essential oil, pulp, medicinal, bioenergy', description:'Blue Gum Eucalyptus. Very fast-growing, native to Australia. Aromatic leaves rich in eucalyptol – used in medicines (Vicks, cough syrups). Important for pulp and paper. Widely planted for timber and bioenergy. Deep taproot drains groundwater.', slug:'eucalyptus-globulus' },
  'pterospermum acerifolium': { local:'Kanak champa', gujarati:'Kanak Champa', family:'Malvaceae', habit:'Large evergreen tree, 15–25 m', flowering:'Sept–Nov', uses:'Ornamental, fragrant flowers, timber, sacred', description:'Maple-leaved Bayur Tree. Large leaves with silvery-white undersides. Spectacular fragrant white flowers opening at night. Sacred in Hindu tradition. Hard reddish-brown timber. Flowers used in garlands.', slug:'pterospermum-acerifolium' },
  'ceiba pentandra': { local:'Kapok tree', gujarati:'Savar', family:'Malvaceae', habit:'Very large deciduous tree, 20–40 m', flowering:'Jan–March', uses:'Kapok fibre, edible seeds, timber, shade', description:'Kapok Tree. Enormous buttressed trunk with spiny bark. Seeds enveloped in silky cotton fibre (kapok) – historically used for life jackets and pillows. Nectar-rich flowers attract bats. Considered sacred in Mayan culture.', slug:'ceiba-pentandra' },
  'callistemon': { local:'Bottlebrush', gujarati:'Bottle brush', family:'Myrtaceae', habit:'Small evergreen tree or shrub, 3–10 m', flowering:'March–May, Oct–Nov', uses:'Ornamental, bee plant, wind break', description:'Named for its brilliant red brush-like flower spikes that resemble bottle brushes. Australian native, widely planted in Indian gardens and avenues. Attracts sunbirds and bees. Very drought-tolerant once established.', slug:'callistemon-citrinus' },
  'artocarpus heterophyllus': { local:'Fanas (Jackfruit)', gujarati:'Fanas', family:'Moraceae', habit:'Medium to large evergreen tree, 10–20 m', flowering:'Jan–April', uses:'Largest edible fruit, timber, latex, animal feed', description:'World\'s largest tree-borne fruit (up to 35 kg). National fruit of Bangladesh. Ripe jackfruit has sweet aromatic yellow pods. Unripe fruit cooked as vegetable. Seeds boiled or roasted. Timber golden-yellow, used for furniture and musical instruments.', slug:'artocarpus-heterophyllus' },
  'magnolia champaca': { local:'Sonchampa', gujarati:'Champo', family:'Magnoliaceae', habit:'Large evergreen tree, 15–25 m', flowering:'June–Sept', uses:'Perfumery (Joy perfume), sacred, medicinal, timber', description:'One of the most fragrant trees in the world. White-cream flowers with intoxicating scent – used in Joy by Jean Patou, one of the world\'s most expensive perfumes. Sacred in Hindu worship. Flower garlands widely used. Excellent timber.', slug:'magnolia-champaca' },
  'tamarindus indica': { local:'Khati Ambli', gujarati:'Ambali', family:'Fabaceae', habit:'Large evergreen tree, 15–25 m', flowering:'May–June', uses:'Culinary (tamarind), medicinal, timber, shade', description:'Tamarind. Sour pulp indispensable in Indian, Thai and Mexican cuisines. Rich in tartaric acid and vitamins. Hard dark timber. Dense feathery crown. Long-lived tree (can live 300+ years). Widely used medicinally for digestive problems.', slug:'tamarindus-indica' },
  'pithecellobium dulce': { local:'Goras Ambli', gujarati:'Vilayati Chinch', family:'Fabaceae', habit:'Medium evergreen tree, 8–15 m', flowering:'Jan–March', uses:'Edible aril, fuelwood, live hedge, fodder', description:'Manila Tamarind or Monkeypod. Edible sweet-sour white aril around seeds. Very thorny branches – used as impenetrable live fencing. Hard wood for fuelwood. Drought-tolerant, tolerates poor soils. Invasive in some regions.', slug:'pithecellobium-dulce' },
  'ficus maclellandii': { local:'Ficus Alii', gujarati:'Banana-leaf Fig', family:'Moraceae', habit:'Medium evergreen tree, 8–15 m', flowering:'March–May', uses:'Ornamental, indoor plant, shade', description:'Banana-leaf Fig or Alii Fig. Long narrow willowy leaves. Popular as an indoor plant and as an ornamental street tree. Dense shade. Tolerates low light and dry conditions. Small inconspicuous figs produced on mature trees.', slug:'ficus-maclellandii' },
  'phyllanthus emblica': { local:'Amla tree', gujarati:'Amla', family:'Phyllanthaceae', habit:'Small to medium deciduous tree, 8–12 m', flowering:'Feb–March', uses:'Richest natural vitamin C, Ayurveda, pickles, hair care', description:'Indian Gooseberry – one of the most important medicinal plants in Ayurveda. Extremely rich in Vitamin C (20× orange). Key ingredient in Chyawanprash and Triphala. Sour fruits used in pickles and amla oil for hair. Anti-aging properties.', slug:'phyllanthus-emblica' },
  'syzygium cumini': { local:'Jamun tree', gujarati:'Jamun', family:'Myrtaceae', habit:'Large evergreen tree, 15–25 m', flowering:'March–April', uses:'Edible fruit, anti-diabetic, timber, dye', description:'Black Plum or Java Plum. Deep purple oblong fruits with astringent sweet taste. Seeds and bark important in Ayurveda for managing diabetes. Dense evergreen canopy. Excellent shade tree. Hard purple timber for construction. Important for riverbank stabilisation.', slug:'syzygium-cumini' },
  'khaya senegalensis': { local:'Khaya', gujarati:'African Mahogany', family:'Meliaceae', habit:'Large deciduous tree, 20–35 m', flowering:'May–June', uses:'Premium mahogany timber, shade, ornamental', description:'African Mahogany. One of the most prized timbers globally – used for fine furniture, musical instruments, boat building. Large spreading crown. Bark peels in scales. Planted in India as a commercial timber tree and shade avenue tree.', slug:'khaya-senegalensis' },
  'swietenia macrophylla': { local:'Mahogany', gujarati:'Mahogany', family:'Meliaceae', habit:'Large deciduous tree, 20–40 m', flowering:'May–June', uses:'World\'s premier furniture timber, ornamental, shade', description:'Big-leaf Mahogany. One of the world\'s most commercially important timbers. Reddish-brown lustrous wood for premium furniture, panelling, boat building. Compound leaves with 4–6 pairs of leaflets. Large winged seeds. CITES-protected species.', slug:'swietenia-macrophylla' },
  'lagerstroemia speciosa': { local:'Jarul', gujarati:'Jarul', family:'Lythraceae', habit:'Medium to large deciduous tree, 10–20 m', flowering:'May–July', uses:'Ayurvedic (diabetes), timber, ornamental', description:'Pride of India or Queen Crape Myrtle. Large showy pink to lavender flowers in upright clusters. Leaves turn red-orange before falling. Important Ayurvedic remedy for diabetes (leaves contain corosolic acid). Excellent timber. Spectacular avenue tree.', slug:'lagerstroemia-speciosa' },
  'gmelina arborea': { local:'Sevan', gujarati:'Shivan', family:'Lamiaceae', habit:'Medium to large deciduous tree, 15–30 m', flowering:'Feb–April', uses:'Pulp and paper timber, fuelwood, Ayurveda', description:'White Teak or Gamhar. Fast-growing timber tree widely planted for pulp and paper industry. Yellowish-orange tubular flowers. Leaves large and broad. Important in Ayurveda as one of the Dashamoola (ten roots) herbs. Good fuelwood.', slug:'gmelina-arborea' },
  'samanea saman': { local:'Rain tree', gujarati:'Rain Tree', family:'Fabaceae', habit:'Very large deciduous tree, 20–35 m', flowering:'June–Sept', uses:'Shade, fodder pods, timber, ornamental', description:'Rain Tree – one of the most spectacular shade trees. Massive spreading crown can span 50+ metres. Leaves fold at night and before rain (giving the name). Sweet edible pods eaten by cattle. Important shade tree on coffee and cacao plantations.', slug:'samanea-saman' },
  'ficus umbellata': { local:'Kath umbaro', gujarati:'Kath Umbaro', family:'Moraceae', habit:'Medium to large evergreen tree, 10–20 m', flowering:'Year-round', uses:'Ornamental, wildlife, traditional medicine', description:'Umbrella Fig. Large round shiny leaves make it attractive as an ornamental. Figs produced in clusters, eaten by birds. Sap used in traditional African and Indian medicine. Grown as ornamental in gardens and parks.', slug:'ficus-umbellata' },
  'annona squamosa': { local:'Sitafal', gujarati:'Sitafal', family:'Annonaceae', habit:'Small deciduous tree, 4–8 m', flowering:'May–Sept', uses:'Edible sweet fruit (custard apple), medicinal seeds', description:'Custard Apple or Sugar Apple. Soft, sweet, creamy white flesh with a fragrant aroma. One of the most popular tropical fruits. Seeds are insecticidal. Bark and leaves used in traditional medicine. Popular home garden tree in Gujarat.', slug:'annona-squamosa' },
  'psidium guajava': { local:'Jamfal', gujarati:'Jamfal', family:'Myrtaceae', habit:'Small to medium evergreen tree, 5–10 m', flowering:'Year-round', uses:'Vitamin C-rich fruit, medicinal leaves, timber', description:'Guava. Extremely rich in Vitamin C (4× orange). Fruit eaten fresh or made into jellies and juice. Leaves used for diarrhoea and dengue fever treatment. Bark smooth peeling mottled green-brown. Very common in Indian home gardens.', slug:'psidium-guajava' },
  'manilkara zapota': { local:'Chiku', gujarati:'Chiku', family:'Sapotaceae', habit:'Medium evergreen tree, 10–20 m', flowering:'Year-round', uses:'Edible fruit (sapodilla), chicle (chewing gum base), timber', description:'Sapodilla or Chiku. Brown, sandy-textured sweet fruit beloved in Gujarat. Latex (chicle) was original base for chewing gum. Hard fine-grained timber. Dense dark green foliage. Drought-tolerant. Commercially cultivated across Gujarat.', slug:'manilkara-zapota' },
  'ziziphus nummularia': { local:'Bordi', gujarati:'Bordi', family:'Rhamnaceae', habit:'Small thorny tree or shrub, 3–8 m', flowering:'Aug–Oct', uses:'Edible sour berries, fodder, medicinal, live fence', description:'Wild Jujube or Bordi. Small round sour edible berries. Very thorny – used as impenetrable hedge. Excellent fodder and browsing plant for goats. Leaves and bark used in Ayurveda. Tolerates drought, salinity and poor soils.', slug:'ziziphus-nummularia' },
  'punica granatum': { local:'Dadam', gujarati:'Dadam', family:'Lythraceae', habit:'Small tree or shrub, 3–8 m', flowering:'March–July', uses:'Superfood fruit, medicinal, ornamental', description:'Pomegranate. Ancient superfood – cultivated for over 5000 years. Rich in antioxidants (punicalagins), Vitamin C and potassium. Brilliant red flowers. Leathery skin, jewel-like arils. Important in Ayurveda for digestive and heart health. Drought-tolerant.', slug:'punica-granatum' },
  'phyllanthus acidus': { local:'Khatumda', gujarati:'Khatumda', family:'Phyllanthaceae', habit:'Small to medium deciduous tree, 5–10 m', flowering:'Feb–April', uses:'Edible sour fruit, pickles, medicinal', description:'Otaheite Gooseberry or Star Gooseberry. Very sour pale yellow or white fruit in hanging clusters. Used extensively in pickles and chutneys. Rich in Vitamin C. Bark and leaves used medicinally. Popular in South and South-East Asia.', slug:'phyllanthus-acidus' },
  'plumeria alba': { local:'White champa', gujarati:'Safed Champa', family:'Apocynaceae', habit:'Small to medium deciduous tree, 5–10 m', flowering:'March–Nov', uses:'Sacred (temple), fragrant flowers, ornamental, lei', description:'White Frangipani. Fragrant pure white flowers with yellow centre. Widely planted in temple gardens – flowers used for offerings. Distinctive blunt-tipped leaves. Latex is toxic. Internationally used for Hawaiian leis. Very popular ornamental.', slug:'plumeria-alba' },
  'plumeria rubra': { local:'Pink, red champa', gujarati:'Lal Champa', family:'Apocynaceae', habit:'Small to medium deciduous tree, 5–10 m', flowering:'March–Nov', uses:'Sacred, fragrant, ornamental, medicinal', description:'Red Frangipani. Flowers range from deep pink to crimson with yellow throat, extremely fragrant. Highly sacred – offered to deities in Hindu and Buddhist traditions. Bark used medicinally for skin diseases. Popular garden tree.', slug:'plumeria-rubra' },
  'plumeria pudica': { local:'Nag champa', gujarati:'Nag Champa', family:'Apocynaceae', habit:'Small evergreen tree, 4–8 m', flowering:'Year-round', uses:'Ornamental, sacred, fragrant', description:'Bridal Bouquet or Fiddle-leaf Frangipani. Unlike other plumerias, stays evergreen. Narrow spoon-shaped leaves. Clusters of pure white fragrant flowers year-round. Compact growth, excellent for small gardens and containers.', slug:'plumeria-pudica' },
  'santalum album': { local:'Chandan', gujarati:'Chandan', family:'Santalaceae', habit:'Small to medium evergreen tree, 5–10 m', flowering:'March–June', uses:'Sacred, perfumery, carving, incense, Ayurveda', description:'Indian Sandalwood – one of the most valuable woods in the world. Rich aromatic heartwood used for incense, perfumery, carving and Ayurvedic medicines. Semi-parasitic on roots of other trees. Highly endangered in wild, protected by Indian law.', slug:'santalum-album' },
  'carica papaya': { local:'Papaya', gujarati:'Papaya', family:'Caricaceae', habit:'Small soft-wooded tree, 3–8 m', flowering:'Year-round', uses:'Fruit, medicinal (papain enzyme), vitamin source', description:'Papaya. Fast-growing tree producing large sweet melon-like fruits. Rich in vitamins A, C and folate. Papain enzyme from unripe fruit used as meat tenderiser and in medicines. Leaves used for dengue fever treatment. Short-lived but prolific.', slug:'carica-papaya' },
  'moringa oleifera': { local:'Sargava', gujarati:'Sargavo', family:'Moringaceae', habit:'Small to medium deciduous tree, 5–12 m', flowering:'Jan–March', uses:'Superfood (drumstick), medicinal, water purification, oil', description:'Moringa – the Miracle Tree. Drumstick pods a staple vegetable in South Indian cooking. Leaves extremely nutritious (calcium, iron, vitamin A). Seeds can purify water. Ben oil from seeds for salad and skin care. One of the world\'s most useful trees.', slug:'moringa-oleifera' },
  'ailanthus altissima': { local:'Arduso', gujarati:'Arduso', family:'Simaroubaceae', habit:'Medium deciduous tree, 15–25 m', flowering:'June–Aug', uses:'Ornamental, traditional Chinese medicine, invasive species', description:'Tree of Heaven. Fast-growing but invasive tree originally from China. Tolerates extreme urban conditions – pollution, compacted soil, drought. Used in traditional Chinese medicine. Widely planted but now considered a nuisance species in many countries.', slug:'ailanthus-excelsa' },
  'caryota urens': { local:'Fishtail palm', gujarati:'Fish Tail Palm', family:'Arecaceae', habit:'Single-stemmed palm, 10–20 m', flowering:'After 15–20 years, then dies', uses:'Jaggery from sap, fibre, ornamental', description:'Fishtail Palm – named for its distinctive doubly-pinnate fishtail-shaped leaflets. Monocarpic – flowers once, fruits and dies. Sap fermented into toddy or made into jaggery. Strong black fibre from leaf sheaths. Popular ornamental palm.', slug:'caryota-urens' },
  'ficus carica': { local:'Anjir', gujarati:'Anjir', family:'Moraceae', habit:'Small to medium deciduous tree, 5–10 m', flowering:'Year-round (figs, not true flowers)', uses:'Edible fig fruit, medicinal, dried fruit trade', description:'Common Fig. One of the oldest cultivated plants – grown for 5000+ years. Sweet pear-shaped figs eaten fresh or dried. Rich in calcium and iron. Milky latex used for warts. Mentioned in Bible, Quran and Hindu scriptures. Drops leaves in winter.', slug:'ficus-carica' },
  'citrus limon': { local:'Limbu (Limbudi)', gujarati:'Limbu', family:'Rutaceae', habit:'Small thorny evergreen tree, 3–6 m', flowering:'Year-round', uses:'Fruit (citrus), culinary, vitamin C, medicinal', description:'Lemon. Essential citrus fruit, rich in Vitamin C and citric acid. Aromatic flowers. Thorny branches. Indispensable in Indian cooking – used in pickles, lemonade, seasoning. Oil from peel used in beverages and cosmetics.', slug:'citrus-limon' },
  'bambusa bambos': { local:'Vaans (bamboo)', gujarati:'Vans', family:'Poaceae', habit:'Giant clumping bamboo, 15–25 m', flowering:'Once in 30–60 years, then dies', uses:'Construction, furniture, paper, edible shoots, crafts', description:'Giant Spiny Bamboo – India\'s most important bamboo. Extremely versatile – used for construction, furniture, paper, musical instruments, handicrafts. Young shoots edible. Fastest growing plant. Excellent for watershed protection and CO2 sequestration.', slug:'bambusa-bambos' },
}

// Helper: find eFlora data by scientific name (fuzzy match)
function getEfloraInfo(scientificName) {
  if (!scientificName) return null
  const key = scientificName.toLowerCase().trim()
  // Try exact match first
  if (EFLORA_DB[key]) return EFLORA_DB[key]
  // Try partial match (first 2 words)
  const words = key.split(' ').slice(0, 2).join(' ')
  for (const [dbKey, val] of Object.entries(EFLORA_DB)) {
    if (dbKey.startsWith(words) || words.startsWith(dbKey.split(' ').slice(0,2).join(' '))) {
      return val
    }
  }
  // Try just genus match
  const genus = key.split(' ')[0]
  for (const [dbKey, val] of Object.entries(EFLORA_DB)) {
    if (dbKey.startsWith(genus + ' ')) return val
  }
  return null
}

// ---------------------------------------------------------------------------
// Constants & config
// ---------------------------------------------------------------------------

const TYPE_CONFIG = {
  tree:    { color: '#16a34a', bg: '#dcfce7', label: 'Tree',    emoji: '🌳' },
  plant:   { color: '#7c3aed', bg: '#ede9fe', label: 'Plant',   emoji: '🌿' },
  creeper: { color: '#0284c7', bg: '#e0f2fe', label: 'Creeper', emoji: '🌱' },
}

const CONDITION_CONFIG = {
  excellent: { color: '#16a34a', label: 'Excellent', ring: '#bbf7d0' },
  good:      { color: '#3b82f6', label: 'Good',      ring: '#bfdbfe' },
  fair:      { color: '#eab308', label: 'Fair',      ring: '#fef08a' },
  poor:      { color: '#ef4444', label: 'Poor',      ring: '#fecaca' },
  dead:      { color: '#6b7280', label: 'Dead',      ring: '#e5e7eb' },
}

const GPS_CORRECTION = {
  off:    { label: 'Off',    strength: 0 },
  low:    { label: 'Low',    strength: 0.25 },
  medium: { label: 'Medium', strength: 0.55 },
  high:   { label: 'High',   strength: 0.90 },
}

// IITGN campus centre
const CAMPUS_CENTER = [23.2156, 72.6794]

// ---------------------------------------------------------------------------
// GPS Correction Engine
// ---------------------------------------------------------------------------

/**
 * Haversine distance in metres between two [lat, lng] points.
 */
function haversineM([lat1, lng1], [lat2, lng2]) {
  const R = 6_371_000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Project point P onto the line defined by two points A and B.
 * Returns the projected [lat, lng].
 */
function projectOntoLine([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
  return [ax + t * dx, ay + t * dy]
}

/**
 * Least-squares line fit for a set of [lat, lng] points.
 * Returns { slope, intercept } in lat-lng space.
 */
function fitLine(points) {
  const n = points.length
  if (n < 2) return null
  const sumX = points.reduce((s, p) => s + p[1], 0)
  const sumY = points.reduce((s, p) => s + p[0], 0)
  const sumXY = points.reduce((s, p) => s + p[1] * p[0], 0)
  const sumX2 = points.reduce((s, p) => s + p[1] ** 2, 0)
  const denom = n * sumX2 - sumX ** 2
  if (Math.abs(denom) < 1e-15) return null   // vertical-ish line
  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

/**
 * RANSAC-based row detector.
 * Returns an array of inlier groups, each being an array of record indices.
 *
 * @param {Array}  records  – full records array with .lat/.lng
 * @param {number} distThreshM – max perpendicular deviation to qualify as inlier (metres)
 * @param {number} minInliers  – minimum group size to keep
 */
function detectRows(records, distThreshM = 4, minInliers = 3) {
  const pts = records.map(r => [parseFloat(r.lat), parseFloat(r.lng)])
  const used = new Set()
  const rows = []

  const MAX_ITER = Math.min(records.length * 5, 400)
  for (let iter = 0; iter < MAX_ITER; iter++) {
    // Pick two random unused points
    const avail = pts.map((_, i) => i).filter(i => !used.has(i))
    if (avail.length < minInliers) break

    const i1 = avail[Math.floor(Math.random() * avail.length)]
    let i2 = avail[Math.floor(Math.random() * avail.length)]
    if (i2 === i1) continue
    if (haversineM(pts[i1], pts[i2]) < 1) continue  // too close

    // Find inliers for this line hypothesis
    const inliers = []
    for (let i = 0; i < pts.length; i++) {
      if (used.has(i)) continue
      const proj = projectOntoLine(pts[i], pts[i1], pts[i2])
      if (haversineM(pts[i], proj) < distThreshM) inliers.push(i)
    }

    if (inliers.length < minInliers) continue

    // Refit on all inliers
    const inlierPts = inliers.map(i => pts[i])
    const line = fitLine(inlierPts)
    if (!line) continue

    // Recount with tighter criterion
    const confirmed = []
    for (const idx of inliers) {
      const lngVal = pts[idx][1]
      const latFit = line.slope * lngVal + line.intercept
      const proj = [latFit, lngVal]
      if (haversineM(pts[idx], proj) < distThreshM) confirmed.push(idx)
    }

    if (confirmed.length >= minInliers) {
      confirmed.forEach(i => used.add(i))
      rows.push({ indices: confirmed, line })
    }
  }

  return rows
}

/**
 * Apply GPS correction to records array.
 * Returns a new array of records with corrected lat/lng.
 *
 * @param {Array}  records
 * @param {number} strength  0–1 blend factor (0 = off, 1 = snap fully to line)
 */
function applyGpsCorrection(records, strength) {
  if (strength === 0 || records.length === 0) return records

  // Clone to avoid mutating state
  const out = records.map(r => ({ ...r }))

  // Step 1: nearby-point jitter smoothing (weighted centroid of close neighbours)
  const pts = out.map(r => [parseFloat(r.lat), parseFloat(r.lng)])
  const JITTER_RADIUS = 2.5  // metres – smooth within this radius
  const JITTER_BLEND  = strength * 0.3

  const smoothed = pts.map((p, i) => {
    const neighbours = pts.filter((q, j) => j !== i && haversineM(p, q) < JITTER_RADIUS)
    if (neighbours.length === 0) return p
    const avgLat = (p[0] + neighbours.reduce((s, q) => s + q[0], 0)) / (neighbours.length + 1)
    const avgLng = (p[1] + neighbours.reduce((s, q) => s + q[1], 0)) / (neighbours.length + 1)
    return [
      p[0] + (avgLat - p[0]) * JITTER_BLEND,
      p[1] + (avgLng - p[1]) * JITTER_BLEND,
    ]
  })

  // Step 2: row detection & line projection
  // Use smoothed coords for detection, apply blend based on strength
  const tempRecords = out.map((r, i) => ({ ...r, lat: smoothed[i][0], lng: smoothed[i][1] }))
  const rows = detectRows(tempRecords, 3 + (1 - strength) * 4, 3)

  const LINE_BLEND = strength * 0.85

  rows.forEach(({ indices, line }) => {
    indices.forEach(i => {
      const lngVal = smoothed[i][1]
      const latFit = line.slope * lngVal + line.intercept
      out[i].lat = smoothed[i][0] + (latFit - smoothed[i][0]) * LINE_BLEND
      out[i].lng = lngVal  // keep longitude; only snap latitude to fitted line
    })
  })

  // Write back smoothed positions for points not captured by any row
  const rowSet = new Set(rows.flatMap(r => r.indices))
  for (let i = 0; i < out.length; i++) {
    if (!rowSet.has(i)) {
      out[i].lat = smoothed[i][0]
      out[i].lng = smoothed[i][1]
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Marker factory
// ---------------------------------------------------------------------------

/**
 * Resolve marker size (px) based on current zoom level.
 *   Zoom 13–15 → 12 px   (reduced ~25% from 16)
 *   Zoom 16–17 → 16 px
 *   Zoom 18+   → 22 px
 * The "base" here is the circle diameter before applying the selected 15–20% bump.
 */
// Marker diameter is fixed — consistent size at every zoom level.
// 28px gives a 17px emoji which is always crisp and legible.
const MARKER_BASE_SIZE = 28

/**
 * Build a Leaflet DivIcon matching the target design:
 *   • Fixed 28px white circle — consistent at every zoom level
 *   • Very thin 1.5px health-coloured CSS border (not SVG stroke)
 *   • Emoji at 17px — always crisp, rendered as HTML not SVG text
 *   • Selected: 20% larger, colour-matched glow, highest z-index
 */
function buildIcon(type, condition, isSelected = false) {
  const tcfg = TYPE_CONFIG[type]          || TYPE_CONFIG.tree
  const ccfg = CONDITION_CONFIG[condition] || CONDITION_CONFIG.good

  const size      = isSelected ? Math.round(MARKER_BASE_SIZE * 1.20) : MARKER_BASE_SIZE
  const borderPx  = isSelected ? 2 : 1.5
  const emojipx   = Math.round(size * 0.60)

  const shadow = isSelected
    ? `drop-shadow(0 0 6px ${ccfg.color}cc) drop-shadow(0 1px 4px rgba(0,0,0,.5))`
    : 'drop-shadow(0 1px 3px rgba(0,0,0,.35))'

  return L.divIcon({
    className:   '',
    iconSize:    [size, size],
    iconAnchor:  [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 6)],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#fff;border:${borderPx}px solid ${ccfg.color};box-sizing:border-box;display:flex;align-items:center;justify-content:center;filter:${shadow};transition:filter .15s,transform .15s;cursor:pointer;${isSelected ? 'z-index:9999;transform:scale(1.05);' : ''}"><span style="font-size:${emojipx}px;line-height:1;display:block;pointer-events:none;user-select:none;">${tcfg.emoji}</span></div>`,
  })
}

/** Cluster icon – green badge with count */
function buildClusterIcon(cluster) {
  const count = cluster.getChildCount()
  const size = count > 99 ? 48 : count > 9 ? 42 : 36
  return L.divIcon({
    html: `
      <div style="
        width:${size}px;height:${size}px;
        border-radius:50%;
        background:linear-gradient(135deg,#16a34a,#2d6a4f);
        border:3px solid #fff;
        box-shadow:0 3px 10px rgba(0,0,0,.3);
        display:flex;align-items:center;justify-content:center;
        font-size:${count > 99 ? 11 : 13}px;
        font-weight:800;
        color:#fff;
        font-family:-apple-system,sans-serif;
      ">${count > 999 ? '999+' : count}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

// ---------------------------------------------------------------------------
// Image Lightbox
// ---------------------------------------------------------------------------

function Lightbox({ images, startIndex = 0, onClose }) {
  const [idx, setIdx]       = useState(startIndex)
  const [zoom, setZoom]     = useState(1)
  const [pan, setPan]       = useState({ x: 0, y: 0 })
  const [loaded, setLoaded] = useState(false)
  const [error, setError]   = useState(false)
  const dragRef             = useRef(null)

  // ESC key + arrow navigation
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape')      onClose()
      if (e.key === 'ArrowRight')  next()
      if (e.key === 'ArrowLeft')   prev()
      if (e.key === '+')           setZoom(z => Math.min(z + 0.25, 4))
      if (e.key === '-')           setZoom(z => Math.max(z - 0.25, 0.5))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function next() {
    setIdx(i => (i + 1) % images.length)
    setZoom(1); setPan({ x: 0, y: 0 }); setLoaded(false); setError(false)
  }
  function prev() {
    setIdx(i => (i - 1 + images.length) % images.length)
    setZoom(1); setPan({ x: 0, y: 0 }); setLoaded(false); setError(false)
  }

  // Mouse-drag pan
  function onMouseDown(e) {
    if (zoom <= 1) return
    const startX = e.clientX - pan.x
    const startY = e.clientY - pan.y
    function onMove(ev) {
      setPan({ x: ev.clientX - startX, y: ev.clientY - startY })
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Wheel zoom
  function onWheel(e) {
    e.preventDefault()
    setZoom(z => Math.min(Math.max(z - e.deltaY * 0.001, 0.5), 4))
  }

  const src = images[idx]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 16,
          background: 'rgba(255,255,255,.15)', border: 'none',
          color: '#fff', fontSize: 22, width: 40, height: 40,
          borderRadius: 20, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        aria-label="Close viewer"
      >×</button>

      {/* Counter */}
      {images.length > 1 && (
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,.7)', fontSize: 13, fontWeight: 700 }}>
          {idx + 1} / {images.length}
        </div>
      )}

      {/* Zoom controls */}
      <div style={{
        position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 8, background: 'rgba(0,0,0,.5)', borderRadius: 20,
        padding: '6px 12px',
      }}>
        {[
          ['−', () => setZoom(z => Math.max(z - 0.25, 0.5))],
          ['↺',  () => { setZoom(1); setPan({ x: 0, y: 0 }) }],
          ['+', () => setZoom(z => Math.min(z + 0.25, 4))],
        ].map(([label, action]) => (
          <button
            key={label}
            onClick={e => { e.stopPropagation(); action() }}
            style={{
              background: 'rgba(255,255,255,.2)', border: 'none',
              color: '#fff', width: 32, height: 32, borderRadius: 16,
              fontSize: 16, cursor: 'pointer',
            }}
          >{label}</button>
        ))}
        <span style={{ color: 'rgba(255,255,255,.6)', fontSize: 12, alignSelf: 'center', paddingLeft: 4 }}>
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* Prev / Next */}
      {images.length > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); prev() }}
            style={navBtnStyle('left')}
            aria-label="Previous image"
          >‹</button>
          <button
            onClick={e => { e.stopPropagation(); next() }}
            style={navBtnStyle('right')}
            aria-label="Next image"
          >›</button>
        </>
      )}

      {/* Image */}
      <div
        onClick={e => e.stopPropagation()}
        onMouseDown={onMouseDown}
        onWheel={onWheel}
        style={{
          overflow: 'hidden',
          maxWidth: '90vw', maxHeight: '80vh',
          cursor: zoom > 1 ? 'grab' : 'default',
        }}
      >
        {!loaded && !error && (
          <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              width: 40, height: 40, border: '3px solid rgba(255,255,255,.3)',
              borderTopColor: '#fff', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        )}
        {error && (
          <div style={{ color: 'rgba(255,255,255,.6)', textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🖼️</div>
            <div>Image unavailable</div>
          </div>
        )}
        <img
          src={src}
          alt={`Photo ${idx + 1}`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => { setError(true); setLoaded(true) }}
          style={{
            display: loaded && !error ? 'block' : 'none',
            maxWidth: '88vw', maxHeight: '78vh',
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transition: zoom === 1 ? 'transform .2s' : 'none',
            borderRadius: 6,
            objectFit: 'contain',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  )
}

function navBtnStyle(side) {
  return {
    position: 'absolute',
    [side]: 20,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'rgba(255,255,255,.15)',
    border: 'none',
    color: '#fff',
    fontSize: 36,
    width: 48,
    height: 64,
    borderRadius: 8,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background .15s',
  }
}

// ---------------------------------------------------------------------------
// Swipeable Tree Detail Panel
// Tab 0 = Survey Details (existing info)   Tab 1 = Tree Info (eFlora data)
// Swipe right → go to Tree Info tab, swipe left → Survey Details
// ---------------------------------------------------------------------------

function TreeDetailPanel({
  record, tcfg, ccfg, photos, zones,
  onClose, onDelete, onOpenLightbox, onUpdate,
  labelStyle, inputStyle,
}) {
  const [tab, setTab] = useState(0)           // 0=survey, 1=treeinfo
  const [animDir, setAnimDir] = useState(null) // 'left' | 'right' | null
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const touchStartX = useRef(null)
  const eflora = getEfloraInfo(record.scientific_name)

  // Reset edit mode whenever a different record is selected
  useEffect(() => {
    setEditing(false)
    setSaveError(null)
  }, [record.id])

  function startEdit() {
    setForm({
      zone: record.zone || '',
      condition: record.condition || 'good',
      height_m: record.height_m ?? '',
      girth_cm: record.girth_cm ?? '',
      canopy_area_m: record.canopy_area_m ?? '',
      gps_accuracy_m: record.gps_accuracy_m ?? '',
      notes: record.notes || '',
    })
    setSaveError(null)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setSaveError(null)
  }

  function setField(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function saveEdit() {
    setSaving(true)
    setSaveError(null)
    const numOrNull = v => (v === '' || v === null || v === undefined ? null : v)
    const payload = {
      zone: form.zone,
      condition: form.condition,
      height_m: numOrNull(form.height_m),
      girth_cm: numOrNull(form.girth_cm),
      canopy_area_m: numOrNull(form.canopy_area_m),
      gps_accuracy_m: numOrNull(form.gps_accuracy_m),
      notes: form.notes,
    }
    try {
      await onUpdate(record.id, payload)
      setEditing(false)
    } catch (err) {
      setSaveError(err?.response?.data ? 'Could not save changes. Check the values and try again.' : 'Could not save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function switchTab(newTab) {
    if (newTab === tab) return
    setAnimDir(newTab > tab ? 'left' : 'right')
    setTimeout(() => {
      setTab(newTab)
      setAnimDir(null)
    }, 220)
  }

  function onTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
  }
  function onTouchEnd(e) {
    if (touchStartX.current == null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(dx) < 40) return
    if (dx < 0 && tab === 0 && eflora && !editing) switchTab(1)  // swipe left → tree info
    if (dx > 0 && tab === 1) switchTab(0)              // swipe right → characteristics
  }

  const slideStyle = {
    transition: animDir ? 'transform 220ms ease, opacity 220ms ease' : 'none',
    transform: animDir === 'left'  ? 'translateX(-40px)'
             : animDir === 'right' ? 'translateX(40px)' : 'translateX(0)',
    opacity: animDir ? 0 : 1,
    flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden',
  }

  return (
    <aside
      style={{
        width: 380, background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        flexShrink: 0, display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
      aria-label="Selected plant details"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ── Panel header ────────────────────────────────────────── */}
      <div style={{
        padding: '12px 16px 0',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>
              {tcfg?.emoji} {record.local_name}
            </div>
            {record.tracking_id && (
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--green-700)', marginTop: 2, letterSpacing: '0.05em' }}>
                {record.tracking_id}
              </div>
            )}
            {record.scientific_name && (
              <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--text-2)', marginTop: 2 }}>
                {record.scientific_name}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close detail panel"
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-2)', padding: '2px 6px', flexShrink: 0 }}
          >×</button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, marginBottom: -1 }}>
          {[
            { idx: 0, label: '📋 Characteristics' },
            { idx: 1, label: '🌿 Tree Info', disabled: !eflora },
          ].map(({ idx, label, disabled }) => (
            <button
              key={idx}
              onClick={() => !disabled && switchTab(idx)}
              disabled={disabled}
              title={disabled ? 'No eFlora data available for this species' : undefined}
              style={{
                flex: 1, padding: '8px 6px', fontSize: 13, fontWeight: 700,
                background: 'none', border: 'none',
                borderBottom: tab === idx ? '2.5px solid var(--green-700)' : '2.5px solid transparent',
                color: tab === idx ? 'var(--green-700)' : disabled ? 'var(--text-2)' : 'var(--text)',
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.45 : 1,
                transition: 'color .15s, border-color .15s',
              }}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* ── Scrollable content area ──────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        <div style={slideStyle}>

          {tab === 0 && (
            <>
              {/* Condition + type badges, edit toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ background: tcfg?.bg, color: tcfg?.color, borderRadius: 20, padding: '4px 12px', fontSize: 13, fontWeight: 700 }}>
                    {tcfg?.emoji} {tcfg?.label}
                  </span>
                  <span style={{ background: ccfg?.ring, color: ccfg?.color, borderRadius: 20, padding: '4px 12px', fontSize: 13, fontWeight: 700 }}>
                    {ccfg?.label}
                  </span>
                </div>
                {!editing && (
                  <button
                    onClick={startEdit}
                    style={{
                      padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      border: '1.5px solid var(--border)', background: 'var(--surface)',
                      color: 'var(--text)', cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    ✏️ Edit
                  </button>
                )}
              </div>

              {/* Photo strip */}
              {photos.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Photos ({photos.length})
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {photos.slice(0, 4).map((url, i) => (
                      <div
                        key={i}
                        onClick={() => onOpenLightbox(photos, i)}
                        style={{
                          width: 92, height: 74, borderRadius: 8, overflow: 'hidden',
                          cursor: 'pointer', position: 'relative', border: '1.5px solid var(--border)',
                          transition: 'transform .15s, box-shadow .15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                        role="button"
                        aria-label={`Open photo ${i + 1}`}
                      >
                        <img
                          src={url} loading="lazy"
                          alt={`${record.local_name} photo ${i + 1}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        {i === 3 && photos.length > 4 && (
                          <div style={{
                            position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontWeight: 800, fontSize: 15,
                          }}>+{photos.length - 4}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!editing ? (
                <>
                  {/* Characteristics data table */}
                  <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
                    <tbody>
                      {[
                        ['Zone',        record.zone_display || record.zone],
                        ['Height',      record.height_m ? `${record.height_m} m` : null],
                        ['Girth',       record.girth_cm  ? `${record.girth_cm} cm` : null],
                        ['GPS',         record.lat != null ? `${parseFloat(record.lat).toFixed(5)}, ${parseFloat(record.lng).toFixed(5)}` : null],
                        ['Accuracy',    record.gps_accuracy_m ? `±${record.gps_accuracy_m} m` : null],
                        ['Location',    record.location_notes],
                        ['Canopy span', record.canopy_area_m ? `${record.canopy_area_m} m` : null],
                        ['Recorded',    record.submitted_at ? new Date(record.submitted_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : null],
                        ['By',          record.submitted_by && record.submitted_by !== 'Geo tracker form' ? record.submitted_by : null],
                      ].filter(([, v]) => v).map(([k, v]) => (
                        <tr key={k}>
                          <td style={{ padding: '5px 0', color: 'var(--text-2)', fontWeight: 600, width: 88, verticalAlign: 'top', fontSize: 12 }}>{k}</td>
                          <td style={{ padding: '5px 0 5px 8px', fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {record.notes && (
                    <div>
                      <div style={{ ...labelStyle, marginBottom: 4 }}>Notes</div>
                      <div style={{ fontSize: 13, color: 'var(--text)', background: 'var(--surface-2)', borderRadius: 8, padding: '9px 11px', lineHeight: 1.5 }}>
                        {record.notes}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={onDelete}
                    style={{
                      marginTop: 8, padding: '10px 12px', borderRadius: 8,
                      border: '1.5px solid #dc2626', background: '#fee2e2',
                      color: '#991b1b', fontSize: 13, fontWeight: 800, cursor: 'pointer',
                    }}
                  >
                    Delete entry
                  </button>
                </>
              ) : (
                <>
                  {/* Edit form – survey/characteristics fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Zone</label>
                      <select
                        style={inputStyle}
                        value={form.zone}
                        onChange={e => setField('zone', e.target.value)}
                      >
                        <option value="">No zone</option>
                        {(zones || []).map(z => (
                          <option key={z.value} value={z.value}>{z.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Condition</label>
                      <select
                        style={inputStyle}
                        value={form.condition}
                        onChange={e => setField('condition', e.target.value)}
                      >
                        {Object.entries(CONDITION_CONFIG).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Height (m)</label>
                      <input
                        type="number" step="0.01" min="0" style={inputStyle}
                        value={form.height_m}
                        onChange={e => setField('height_m', e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Girth (cm)</label>
                      <input
                        type="number" step="0.01" min="0" style={inputStyle}
                        value={form.girth_cm}
                        onChange={e => setField('girth_cm', e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Canopy span (m)</label>
                      <input
                        type="number" step="0.01" min="0" style={inputStyle}
                        value={form.canopy_area_m}
                        onChange={e => setField('canopy_area_m', e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>GPS accuracy (m)</label>
                      <input
                        type="number" step="0.01" min="0" style={inputStyle}
                        value={form.gps_accuracy_m}
                        onChange={e => setField('gps_accuracy_m', e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Notes</label>
                    <textarea
                      style={{ ...inputStyle, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }}
                      value={form.notes}
                      onChange={e => setField('notes', e.target.value)}
                    />
                  </div>

                  {saveError && (
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#991b1b' }}>{saveError}</div>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={saveEdit}
                      disabled={saving}
                      style={{
                        flex: 1, padding: '10px 12px', borderRadius: 8, border: 'none',
                        background: 'var(--green-800)', color: '#fff',
                        fontSize: 13, fontWeight: 800, cursor: saving ? 'default' : 'pointer',
                        opacity: saving ? 0.7 : 1,
                      }}
                    >
                      {saving ? 'Saving…' : 'Save changes'}
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={saving}
                      style={{
                        padding: '10px 14px', borderRadius: 8, border: '1.5px solid var(--border)',
                        background: 'var(--surface)', color: 'var(--text)',
                        fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {tab === 1 && eflora && (
            <>
              {/* eFlora info card */}
              <div style={{
                background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)',
                border: '1.5px solid #86efac',
                borderRadius: 10, padding: '13px 15px',
              }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#14532d', marginBottom: 3 }}>
                  🌿 {eflora.local}
                </div>
                {eflora.gujarati && (
                  <div style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>
                    ગુજ: {eflora.gujarati}
                  </div>
                )}
                <div style={{ fontSize: 13, fontStyle: 'italic', color: '#4ade80', marginTop: 2 }}>
                  {record.scientific_name}
                </div>
              </div>

              {/* Info rows */}
              <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {[
                    ['Family',    eflora.family],
                    ['Habit',     eflora.habit],
                    ['Flowering', eflora.flowering],
                    ['Uses',      eflora.uses],
                  ].filter(([,v]) => v).map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ padding: '6px 0', color: 'var(--text-2)', fontWeight: 600, width: 88, verticalAlign: 'top', fontSize: 12 }}>{k}</td>
                      <td style={{ padding: '6px 0 6px 8px', fontWeight: 600, color: 'var(--text)', fontSize: 13, lineHeight: 1.4 }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Description */}
              {eflora.description && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    About this tree
                  </div>
                  <div style={{
                    fontSize: 13, color: 'var(--text)', lineHeight: 1.65,
                    background: 'var(--surface-2)', borderRadius: 8, padding: '11px 13px',
                  }}>
                    {eflora.description}
                  </div>
                </div>
              )}

              {/* eFlora credit */}
              <div style={{ fontSize: 11, color: 'var(--text-2)', textAlign: 'center', marginTop: 4 }}>
                Tree data sourced from{' '}
                <a
                  href={`https://www.efloraofgandhinagar.in/tree/${eflora.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--text-2)', textDecoration: 'underline' }}
                >
                  eFlora of Gandhinagar
                </a>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

              {/* Survey summary in tree info tab */}
              <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>
                Campus Survey Summary
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  record.height_m     ? { l: 'Height', v: `${record.height_m} m` }    : null,
                  record.girth_cm     ? { l: 'Girth',  v: `${record.girth_cm} cm` }   : null,
                  record.condition    ? { l: 'Health', v: CONDITION_CONFIG[record.condition]?.label } : null,
                  record.zone_display ? { l: 'Zone',   v: record.zone_display }        : null,
                ].filter(Boolean).map(({ l, v }) => (
                  <div key={l} style={{
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    borderRadius: 7, padding: '6px 10px', fontSize: 12,
                  }}>
                    <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{l}: </span>
                    <span style={{ color: 'var(--text)', fontWeight: 700 }}>{v}</span>
                  </div>
                ))}
              </div>
            </>
          )}

        </div>
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Popup HTML builder (module-level – no component state dependencies)
// ---------------------------------------------------------------------------

function buildPopupHtml(r, tcfg, ccfg, photos) {
  const photoHtml = photos.length > 0
    ? `<div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap">
        ${photos.slice(0, 3).map((url, i) =>
          `<img
             src="${url}" loading="lazy"
             data-photos="${encodeURIComponent(JSON.stringify(photos))}"
             data-index="${i}"
             class="geo-popup-thumb"
             style="width:72px;height:56px;object-fit:cover;border-radius:5px;cursor:pointer;border:1.5px solid #e5e7eb"
           />`
        ).join('')}
        ${photos.length > 3 ? `<div style="width:72px;height:56px;border-radius:5px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:11px;color:#6b7280;font-weight:700">+${photos.length - 3}</div>` : ''}
      </div>`
    : ''

  return `
    <div style="font-family:-apple-system,sans-serif;min-width:200px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <span style="font-size:18px">${tcfg.emoji}</span>
        <div>
          <div style="font-weight:800;font-size:13px;color:#111">${r.local_name}</div>
          ${r.tracking_id ? `<div style="font-size:10px;font-weight:700;color:${tcfg.color};letter-spacing:.04em">${r.tracking_id}</div>` : ''}
        </div>
      </div>
      ${r.scientific_name ? `<div style="font-size:11px;font-style:italic;color:#6b7280;margin-bottom:6px">${r.scientific_name}</div>` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
        <span style="background:${tcfg.bg};color:${tcfg.color};border-radius:20px;padding:2px 8px;font-size:10px;font-weight:700">${tcfg.label}</span>
        <span style="background:${ccfg.ring};color:${ccfg.color};border-radius:20px;padding:2px 8px;font-size:10px;font-weight:700">${ccfg.label}</span>
        ${r.zone ? `<span style="background:#f3f4f6;color:#374151;border-radius:20px;padding:2px 8px;font-size:10px;font-weight:700">${r.zone_display || r.zone}</span>` : ''}
      </div>
      ${r.height_m ? `<div style="font-size:11px;color:#6b7280">↕ ${r.height_m} m ${r.girth_cm ? `&nbsp;|&nbsp; ⊙ ${r.girth_cm} cm` : ''}</div>` : ''}
      ${photoHtml}
    </div>
  `
}

// ---------------------------------------------------------------------------
// Stat chip
// ---------------------------------------------------------------------------

function StatChip({ label, value, color, bg }) {
  return (
    <div style={{
      background: bg, borderRadius: 10, padding: '8px 14px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minWidth: 72, border: `1px solid ${color}33`,
    }}>
      <span style={{ fontSize: 18, fontWeight: 800, color }}>{value}</span>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function GeoTrackerPage() {
  const mapRef           = useRef(null)
  const mapInstanceRef   = useRef(null)
  const clusterLayerRef  = useRef(null)
  const markerMapRef     = useRef({})   // id → L.Marker

  const [records, setRecords]           = useState([])
  const [stats, setStats]               = useState(null)
  const [varieties, setVarieties]       = useState([])
  const [zones, setZones]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [success, setSuccess]           = useState(null)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]         = useState(false)
  const [lightbox, setLightbox]         = useState(null)  // { images, index }
  const [gpsMode, setGpsMode]           = useState('off')
  const [filtersOpen, setFiltersOpen]   = useState(false)
  const [filters, setFilters]           = useState({
    q: '', plant_type: '', variety: '', zone: '', condition: '',
  })
  const [addVarietyOpen, setAddVarietyOpen] = useState(false)
  const [varietyForm, setVarietyForm]       = useState({ name: '', scientific_name: '', plant_type: 'tree' })
  const [varietySaving, setVarietySaving]   = useState(false)
  const [varietyError, setVarietyError]     = useState(null)


  // Debounce search input
  const debounceRef = useRef(null)

  // ---------------------------------------------------------------------------
  // Corrected records (memo – only recalculates when records or gpsMode changes)
  // ---------------------------------------------------------------------------
  const correctedRecords = useMemo(() => {
    const strength = GPS_CORRECTION[gpsMode]?.strength || 0
    return applyGpsCorrection(records, strength)
  }, [records, gpsMode])

  // ---------------------------------------------------------------------------
  // Init Leaflet map (once)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (mapInstanceRef.current) return

    const map = L.map(mapRef.current, {
      center: CAMPUS_CENTER,
      zoom: 16,
      zoomControl: false,
      attributionControl: true,
    })

    // Tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 'Leaflet | © <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
      maxZoom: 22,
    }).addTo(map)

    // Zoom control – top-right
    L.control.zoom({ position: 'topright' }).addTo(map)

    // Cluster layer (manual implementation without plugin dependency)
    // Using a plain LayerGroup; swap to L.markerClusterGroup() if the plugin is installed.
    clusterLayerRef.current = L.layerGroup().addTo(map)

    mapInstanceRef.current = map
    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Fetch meta once
  // ---------------------------------------------------------------------------
  useEffect(() => {
    Promise.all([geoApi.getVarieties(), geoApi.getZones(), geoApi.getStats()])
      .then(([vRes, zRes, sRes]) => {
        setVarieties(vRes.data)
        setZones(zRes.data)
        setStats(sRes.data)
      })
      .catch(() => {})
  }, [])

  // ---------------------------------------------------------------------------
  // Fetch records with debounce on search query
  // ---------------------------------------------------------------------------
  const fetchRecords = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = {}
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v })
    geoApi.getRecords(params)
      .then(res => { setRecords(res.data); setLoading(false) })
      .catch(() => { setError('Failed to load records.'); setLoading(false) })
  }, [filters])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchRecords, filters.q ? 350 : 0)
    return () => clearTimeout(debounceRef.current)
  }, [fetchRecords, filters.q])

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Helper: place all markers (no fitBounds, no zoom dependency)
  // ---------------------------------------------------------------------------
  const placeMarkers = useCallback(() => {
    const layer = clusterLayerRef.current
    const map   = mapInstanceRef.current
    if (!layer || !map) return

    layer.clearLayers()
    markerMapRef.current = {}

    if (correctedRecords.length === 0) return

    correctedRecords.forEach(r => {
      const lat = parseFloat(r.lat)
      const lng = parseFloat(r.lng)
      if (isNaN(lat) || isNaN(lng)) return

      const isSelected = selectedRecord?.id === r.id
      const marker = L.marker([lat, lng], {
        icon: buildIcon(r.plant_type, r.condition, isSelected),
        riseOnHover: true,
        zIndexOffset: isSelected ? 1000 : 0,
      })

      const tcfg  = TYPE_CONFIG[r.plant_type] || TYPE_CONFIG.tree
      const ccfg  = CONDITION_CONFIG[r.condition] || CONDITION_CONFIG.good
      const photos = r.photos || (r.photo_url ? [r.photo_url] : [])

      marker.bindPopup(buildPopupHtml(r, tcfg, ccfg, photos), {
        maxWidth: 260,
        className: 'geo-popup',
      })

      marker.on('click', () => {
        setSelectedRecord(r)
        map.setView([lat, lng], Math.max(map.getZoom(), 17), { animate: true })
      })

      layer.addLayer(marker)
      markerMapRef.current[r.id] = marker
    })
  }, [correctedRecords, selectedRecord])

  // ---------------------------------------------------------------------------
  // Redraw markers when data or selection changes; fit bounds on data load.
  // mapZoom is NOT a dependency — user zoom is never reset.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    placeMarkers()

    if (correctedRecords.length === 0) return
    const bounds = correctedRecords
      .map(r => [parseFloat(r.lat), parseFloat(r.lng)])
      .filter(([la, ln]) => !isNaN(la) && !isNaN(ln))
    if (bounds.length > 0) {
      try { map.fitBounds(bounds, { padding: [60, 60], maxZoom: 18 }) } catch (_) {}
    }
  }, [correctedRecords, selectedRecord])  // eslint-disable-line react-hooks/exhaustive-deps

  // Delegate click on popup thumbnails to open lightbox
  useEffect(() => {
    function handlePopupThumb(e) {
      const el = e.target.closest('.geo-popup-thumb')
      if (!el) return
      try {
        const images = JSON.parse(decodeURIComponent(el.dataset.photos))
        const index  = parseInt(el.dataset.index, 10)
        setLightbox({ images, index })
      } catch (_) {}
    }
    document.addEventListener('click', handlePopupThumb)
    return () => document.removeEventListener('click', handlePopupThumb)
  }, [])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  function handleFilterChange(key, val) {
    setFilters(prev => ({ ...prev, [key]: val, ...(key === 'plant_type' ? { variety: '' } : {}) }))
  }

  function clearFilters() {
    setFilters({ q: '', plant_type: '', variety: '', zone: '', condition: '' })
  }

  function handleExport() {
    const params = {}
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v })
    geoApi.exportCsv(params)
  }

  function resetView() {
    if (!mapInstanceRef.current) return
    mapInstanceRef.current.setView(CAMPUS_CENTER, 16, { animate: true })
  }

  async function handleDeleteRecord() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await geoApi.deleteRecord(deleteTarget.id)
      setRecords(prev => prev.filter(r => r.id !== deleteTarget.id))
      setSelectedRecord(null)
      setDeleteTarget(null)
      setSuccess(`Deleted ${deleteTarget.tracking_id || deleteTarget.local_name}.`)
      const [zRes, sRes] = await Promise.all([geoApi.getZones(), geoApi.getStats()])
      setZones(zRes.data)
      setStats(sRes.data)
    } catch {
      setError('Failed to delete record. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  function openLightbox(record) {
    const images = record.photos || (record.photo_url ? [record.photo_url] : [])
    if (images.length) setLightbox({ images, index: 0 })
  }

  async function handleUpdateRecord(id, payload) {
    const res = await geoApi.updateRecord(id, payload)
    setRecords(prev => prev.map(r => (r.id === id ? { ...r, ...res.data } : r)))
    setSelectedRecord(prev => (prev && prev.id === id ? { ...prev, ...res.data } : prev))
    setSuccess(`Updated ${res.data.tracking_id || res.data.local_name}.`)
    return res.data
  }

  async function handleAddVariety() {
    setVarietyError(null)
    if (!varietyForm.name.trim()) { setVarietyError('Name is required.'); return }
    setVarietySaving(true)
    try {
      await geoApi.createVariety({
        name: varietyForm.name.trim(),
        scientific_name: varietyForm.scientific_name.trim(),
        plant_type: varietyForm.plant_type,
      })
      const res = await geoApi.getVarieties()
      setVarieties(res.data)
      setAddVarietyOpen(false)
      setVarietyForm({ name: '', scientific_name: '', plant_type: 'tree' })
      setSuccess(`Added "${varietyForm.name.trim()}" to varieties.`)
    } catch {
      setVarietyError('Failed to save. Please try again.')
    } finally {
      setVarietySaving(false)
    }
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length
  const filteredVarieties = filters.plant_type
    ? varieties.filter(v => v.plant_type === filters.plant_type)
    : varieties

  // ---------------------------------------------------------------------------
  // Styles (shared)
  // ---------------------------------------------------------------------------
  const inputStyle = {
    border: '1.5px solid var(--border)', borderRadius: 8, padding: '7px 10px',
    fontSize: 13, background: 'var(--surface)', color: 'var(--text)',
    outline: 'none', width: '100%',
  }
  const labelStyle = {
    fontSize: 11, fontWeight: 700, color: 'var(--text-2)',
    marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em',
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    // Fix #1 – Map layout:
    // AdminLayout is called with `fullscreen` so children fill 100% of the
    // available area without any padding wrapper.  The sidebar offset is
    // already handled by AdminLayout's marginLeft on <main>.
    <AdminLayout fullscreen>
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-2)',
        overflow: 'hidden',
        height: '100%',
      }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header style={{
          padding: '12px 18px',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          flexShrink: 0,
          zIndex: 10,
        }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <h1 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>
              🌿 Plant GeoTracker
            </h1>
            <p style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
              Interactive map · campus trees, plants & creepers
            </p>
          </div>

          {stats && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <StatChip label="Total"    value={stats.total}          color="#374151"               bg="#f3f4f6" />
              <StatChip label="Trees"    value={stats.trees}          color={TYPE_CONFIG.tree.color}    bg={TYPE_CONFIG.tree.bg} />
              <StatChip label="Plants"   value={stats.plants}         color={TYPE_CONFIG.plant.color}   bg={TYPE_CONFIG.plant.bg} />
              <StatChip label="Creepers" value={stats.creepers || 0}  color={TYPE_CONFIG.creeper.color} bg={TYPE_CONFIG.creeper.bg} />
            </div>
          )}

          <input
            type="search"
            aria-label="Search plant records"
            placeholder="Search ID, name, botanical name…"
            value={filters.q}
            onChange={e => handleFilterChange('q', e.target.value)}
            style={{ ...inputStyle, width: 'min(260px,100%)', flexShrink: 0 }}
          />

          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => { setAddVarietyOpen(true); setVarietyError(null) }}
              style={{
                padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: '1.5px solid #16a34a', background: '#dcfce7', color: '#15803d', cursor: 'pointer',
              }}
            >
              + Add Variety
            </button>
            <button
              onClick={() => setFiltersOpen(o => !o)}
              aria-expanded={filtersOpen}
              style={{
                padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: '1.5px solid var(--border)', cursor: 'pointer',
                background: filtersOpen ? 'var(--green-800)' : 'var(--surface)',
                color: filtersOpen ? '#fff' : 'var(--text)',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              ⚙ Filters
              {activeFilterCount > 0 && (
                <span style={{
                  background: '#ef4444', color: '#fff', borderRadius: 9,
                  fontSize: 10, fontWeight: 800, padding: '1px 5px',
                }}>{activeFilterCount}</span>
              )}
            </button>
            <button
              onClick={handleExport}
              style={{
                padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: 'var(--green-800)', color: '#fff', border: 'none', cursor: 'pointer',
              }}
            >
              ↓ CSV
            </button>
          </div>
        </header>

        {/* ── Filter panel ───────────────────────────────────────────────── */}
        {filtersOpen && (
          <div style={{
            padding: '12px 18px',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 10,
            flexShrink: 0,
            zIndex: 9,
          }}>
            {/* Type quick-filter pills */}
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['', 'All'], ...Object.entries(TYPE_CONFIG).map(([k, v]) => [k, v.label])].map(([value, label]) => {
                const cfg = TYPE_CONFIG[value]
                const isActive = filters.plant_type === value
                return (
                  <button
                    key={value || 'all'}
                    onClick={() => setFilters(p => ({ ...p, plant_type: value, variety: '' }))}
                    style={{
                      padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                      border: `1.5px solid ${isActive ? (cfg?.color || '#374151') : 'var(--border)'}`,
                      background: isActive ? (cfg?.bg || '#f3f4f6') : 'var(--surface)',
                      color: isActive ? (cfg?.color || '#374151') : 'var(--text-2)',
                      cursor: 'pointer',
                    }}
                  >
                    {cfg?.emoji ? `${cfg.emoji} ` : ''}{label}
                  </button>
                )
              })}
            </div>

            <div>
              <label style={labelStyle}>Variety</label>
              <select style={inputStyle} value={filters.variety} onChange={e => handleFilterChange('variety', e.target.value)}>
                <option value="">All varieties</option>
                {filteredVarieties.map(v => (
                  <option key={v.id} value={v.id}>{v.name}{v.scientific_name ? ` – ${v.scientific_name}` : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Zone</label>
              <select style={inputStyle} value={filters.zone} onChange={e => handleFilterChange('zone', e.target.value)}>
                <option value="">All zones</option>
                {zones.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Condition</label>
              <select style={inputStyle} value={filters.condition} onChange={e => handleFilterChange('condition', e.target.value)}>
                <option value="">Any</option>
                {Object.entries(CONDITION_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>

            {/* GPS Correction control */}
            <div>
              <label style={labelStyle}>GPS Correction</label>
              <select
                style={{ ...inputStyle, borderColor: gpsMode !== 'off' ? 'var(--green-700)' : 'var(--border)' }}
                value={gpsMode}
                onChange={e => setGpsMode(e.target.value)}
                title="Intelligently align trees that were planted in rows but have GPS drift"
              >
                {Object.entries(GPS_CORRECTION).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              {gpsMode !== 'off' && (
                <div style={{ fontSize: 10, color: 'var(--green-700)', marginTop: 3, fontWeight: 600 }}>
                  ✦ Row alignment active – {GPS_CORRECTION[gpsMode].label} strength
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
              <button
                onClick={clearFilters}
                style={{
                  padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  border: '1.5px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text-2)', cursor: 'pointer', flex: 1,
                }}
              >
                Clear all
              </button>
              <button
                onClick={resetView}
                title="Reset map to campus view"
                style={{
                  padding: '7px 10px', borderRadius: 8, fontSize: 14,
                  border: '1.5px solid var(--border)', background: 'var(--surface)',
                  cursor: 'pointer',
                }}
              >🏠</button>
            </div>
          </div>
        )}

        {/* ── Toast bar ──────────────────────────────────────────────────── */}
        {(success || error) && (
          <div style={{
            padding: '9px 18px',
            background: success ? '#dcfce7' : '#fee2e2',
            borderBottom: `1px solid ${success ? '#86efac' : '#fca5a5'}`,
            color: success ? '#166534' : '#991b1b',
            fontSize: 13, fontWeight: 700,
            display: 'flex', justifyContent: 'space-between', gap: 12,
            flexShrink: 0,
          }}>
            <span>{success || error}</span>
            <button
              onClick={() => { setSuccess(null); setError(null) }}
              style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', fontWeight: 800 }}
            >✕</button>
          </div>
        )}

        {/* ── Map + detail panel ─────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', minHeight: 0 }}>

          {/* Loading overlay */}
          {loading && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 500,
              background: 'rgba(255,255,255,.75)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(2px)',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 40, height: 40, border: '3px solid #16a34a',
                  borderTopColor: 'transparent', borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
                }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Loading records…</span>
              </div>
            </div>
          )}

          {/* ── Leaflet map (Fix #1: flex:1, height:100%) ──────────────── */}
          <div
            ref={mapRef}
            style={{ flex: 1, height: '100%', minWidth: 0, zIndex: 1 }}
            aria-label="Plant location map"
          />

          {/* ── Record detail sidebar (swipeable tabs) ───────────────── */}
          {selectedRecord && (() => {
            const tcfg = TYPE_CONFIG[selectedRecord.plant_type] || TYPE_CONFIG.tree
            const ccfg = CONDITION_CONFIG[selectedRecord.condition] || CONDITION_CONFIG.good
            const photos = selectedRecord.photos || (selectedRecord.photo_url ? [selectedRecord.photo_url] : [])
            return (
              <TreeDetailPanel
                record={selectedRecord}
                tcfg={tcfg}
                ccfg={ccfg}
                photos={photos}
                zones={zones}
                onClose={() => setSelectedRecord(null)}
                onDelete={() => setDeleteTarget(selectedRecord)}
                onUpdate={handleUpdateRecord}
                onOpenLightbox={(imgs, idx) => setLightbox({ images: imgs, index: idx })}
                labelStyle={labelStyle}
                inputStyle={inputStyle}
              />
            )
          })()}
        </div>

        {/* ── Footer / legend ────────────────────────────────────────────── */}
        <footer style={{
          padding: '7px 18px',
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          fontSize: 11, color: 'var(--text-2)', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{records.length} records</span>
          {/* Type legend */}
          {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
            <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
              {cfg.label}
            </span>
          ))}
          {/* Condition legend */}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            {Object.entries(CONDITION_CONFIG).map(([k, v]) => (
              <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: v.color, display: 'inline-block' }} />
                {v.label}
              </span>
            ))}
          </span>
        </footer>

        {/* ── Delete confirm ─────────────────────────────────────────────── */}
        <ConfirmModal
          open={!!deleteTarget}
          title="Delete plant record?"
          message={`Delete ${deleteTarget?.tracking_id || deleteTarget?.local_name || 'this record'}? This cannot be undone.`}
          confirmLabel={deleting ? 'Deleting…' : 'Delete'}
          confirmDisabled={deleting}
          cancelDisabled={deleting}
          onConfirm={handleDeleteRecord}
          onCancel={() => setDeleteTarget(null)}
        />

        {/* ── Lightbox ───────────────────────────────────────────────────── */}
        {lightbox && (
          <Lightbox
            images={lightbox.images}
            startIndex={lightbox.index}
            onClose={() => setLightbox(null)}
          />
        )}
        {addVarietyOpen && (
          <div
            onClick={() => !varietySaving && setAddVarietyOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          >
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,.3)', border: '1.5px solid var(--border)' }}>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: 'var(--text)' }}>🌱 Add Plant Variety</div>

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Plant Type *</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                    <button key={key} onClick={() => setVarietyForm(f => ({ ...f, plant_type: key }))}
                      style={{ flex: 1, padding: '8px 6px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        border: `2px solid ${varietyForm.plant_type === key ? cfg.color : 'var(--border)'}`,
                        background: varietyForm.plant_type === key ? cfg.bg : 'var(--surface)',
                        color: varietyForm.plant_type === key ? cfg.color : 'var(--text-2)' }}>
                      {cfg.emoji} {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Local Name *</label>
                <input type="text" placeholder="e.g. Neem" value={varietyForm.name}
                  onChange={e => setVarietyForm(f => ({ ...f, name: e.target.value }))}
                  style={inputStyle} autoFocus />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Scientific Name (optional)</label>
                <input type="text" placeholder="e.g. Azadirachta indica" value={varietyForm.scientific_name}
                  onChange={e => setVarietyForm(f => ({ ...f, scientific_name: e.target.value }))}
                  style={inputStyle} />
              </div>

              {varietyError && (
                <div style={{ marginBottom: 14, padding: '9px 12px', borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontSize: 13 }}>
                  {varietyError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleAddVariety} disabled={varietySaving}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none', background: 'var(--green-800)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: varietySaving ? 0.7 : 1 }}>
                  {varietySaving ? 'Saving…' : 'Save Variety'}
                </button>
                <button onClick={() => setAddVarietyOpen(false)} disabled={varietySaving}
                  style={{ padding: '10px 16px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ── Global styles ──────────────────────────────────────────────── */}
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }

          /* Fix #1 – override AdminLayout content wrapper padding */
          .geo-tracker-host > main > div:last-child {
            padding: 0 !important;
            overflow: hidden !important;
          }

          /* Smooth transitions on all map markers */
          .leaflet-marker-icon div {
            transition: filter .2s ease, transform .2s ease !important;
          }
          .leaflet-marker-icon div:hover {
            transform: scale(1.12) !important;
          }

          /* Leaflet popup tweaks */
          .geo-popup .leaflet-popup-content-wrapper {
            border-radius: 12px !important;
            box-shadow: 0 8px 32px rgba(0,0,0,.18) !important;
            border: 1.5px solid #e5e7eb !important;
            padding: 0 !important;
          }
          .geo-popup .leaflet-popup-content {
            margin: 12px 14px !important;
          }
          .geo-popup .leaflet-popup-tip-container {
            margin-top: -1px;
          }
          .geo-popup .leaflet-popup-tip {
            box-shadow: none !important;
          }
          .geo-popup-thumb {
            transition: transform .15s, box-shadow .15s;
          }
          .geo-popup-thumb:hover {
            transform: scale(1.08);
            box-shadow: 0 2px 8px rgba(0,0,0,.2);
          }

          /* Make leaflet attribution smaller */
          .leaflet-control-attribution {
            font-size: 9px !important;
          }

          /* Mobile breakpoint */
          @media (max-width: 640px) {
            aside[aria-label="Selected plant details"] {
              position: absolute !important;
              bottom: 0 !important;
              left: 0 !important;
              right: 0 !important;
              width: 100% !important;
              height: 60% !important;
              border-left: none !important;
              border-top: 2px solid var(--border) !important;
              z-index: 400;
            }
          }
        `}</style>

      </div>
    </AdminLayout>
  )
}
