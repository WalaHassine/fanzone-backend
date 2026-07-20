– Document de conception du projet Smart Fan Zone Recommendation Platform for the FIFA World Cup 

Wala Hassine 

8 juillet 2026 

# **1 Présentation générale et contexte du projet** 

## **1.1 Identification du projet** 

World Cup FanZone AI est une application web dédiée à la recommandation intelligente de lieux de visionnage collectif. Le livrable attendu est un MVP fonctionnel et démontrable, centré sur trois piliers : cartographie des fan zones, présence anonyme des supporters et recommandation par intelligence artificielle. 

## **1.2 Contexte métier** 

Le projet s’inscrit dans le cadre de la Coupe du Monde FIFA, événement générant : 

- une forte affluence de supporters, concentrée dans les villes hôtes et à l’international ; 

- une multiplicité des lieux de diffusion : cafés, restaurants, espaces publics ; 

- une opportunité technologique claire : intégrer une couche IA pour personnaliser l’expérience du fan, là où les solutions existantes restent statiques. 

## **1.3 Architecture technique de référence** 

La stack technique retenue repose sur les choix suivants : 

- **Frontend :** Next.js associé à Tailwind CSS. 

- **Backend :** NestJS, structuré selon une architecture modulaire par services. 

- **Base de données :** PostgreSQL, choisie pour la nature relationnelle des données et son évolutivité géospatiale (PostGIS). 

- **Cartographie :** Leaflet.js couplé à OpenStreetMap. 

- **Authentification :** JWT associé à bcrypt pour le hachage des mots de passe. 

1 

- **Intelligence artificielle :** API OpenAI ou service IA local, accessible via une interface d’abstraction. 

- **Déploiement :** Vercel pour le frontend ; Render, Railway ou VPS pour le backend et la base de données. 

# **2 Problématique** 

## **2.1 Constats** 

L’analyse du contexte fait apparaître cinq constats principaux : 

- la dispersion de l’information sur les lieux de diffusion entraîne une perte de temps et une décision non éclairée pour le fan ; 

- l’absence de visibilité sur l’affluence en temps réel provoque des déplacements inutiles vers des lieux déjà saturés ; 

- l’absence de recommandation personnalisée conduit à une expérience générique, non adaptée au profil de chaque supporter ; 

- l’absence d’indicateur de présence communautaire rend difficile l’identification d’une ambiance propice, notamment entre supporters d’une même équipe ; 

- l’absence de système d’alerte centralisé expose le fan au risque de manquer un match de son équipe favorite. 

## **2.2 Enjeux associés** 

Ces constats se traduisent en quatre enjeux de conception : 

- **Enjeu utilisateur :** réduire le temps et l’effort nécessaires pour trouver un lieu de visionnage adapté. 

- **Enjeu technique :** concevoir une architecture modulaire et extensible, livrable dans un délai d’un mois. 

- **Enjeu de confidentialité :** garantir l’anonymat des utilisateurs tout en offrant une vision communautaire agrégée. 

- **Enjeu de personnalisation :** exploiter l’intelligence artificielle pour dépasser la simple cartographie statique. 

## **2.3 Question de conception** 

Comment concevoir une architecture logicielle modulaire permettant de recommander, en temps quasi réel, le lieu de visionnage le plus adapté à un supporter, tout en garantissant la confidentialité des données et la scalabilité future du système ? 

2 

## **2.4 Critères de réussite de la conception** 

Quatre critères guident les choix de conception présentés dans ce document : 

- **Traçabilité :** chaque exigence fonctionnelle doit être portée par un composant identifiable de l’architecture. 

- **Modularité :** chaque service doit être autonome, testable et remplaçable indépendamment des autres. 

- **Confidentialité par conception :** l’anonymisation doit être intégrée au niveau du modèle de données, et non ajoutée en surcouche. 

- **Extensibilité :** le modèle de données doit anticiper une évolution géospatiale via PostGIS. 

# **3 Solution proposée** 

## **3.1 Principe général** 

La solution consiste en une plateforme web centralisant trois dimensions : les matchs de la compétition, les fan zones disponibles et un module de recommandation généré par IA. 

L’architecture retenue repose sur un découpage en services métier autonomes, selon une approche modulaire propre à NestJS. La valeur ajoutée différenciante réside dans la capacité du système à recommander une fan zone et à en expliquer le choix en langage naturel. 

## **— 3.2 Architecture logicielle vue par services** 

Le système est structuré en huit services, chacun porteur d’une responsabilité métier unique : 

- **Auth Service** — inscription, authentification, gestion des rôles. 

- **User Service** — profil, préférences, équipes favorites. 

- **Match Service** — gestion et consultation des matchs. 

- **FanZone Service** — gestion et consultation des fan zones. 

- **CheckIn Service** — check-in anonyme et calcul de la présence agrégée. 

- **AI Recommendation Service** — calcul de la recommandation, génération de l’explication et des descriptions automatiques. 

- **Alert Service** — suggestion et déclenchement des alertes. 

- **Admin Statistics Service** — statistiques agrégées destinées à l’administrateur. 

3 

# **4 Objectifs du projet** 

## **4.1 Objectifs généraux** 

||Objectif|
|---|---|
|**OG1**|Centraliser l’information sur les matchs et les lieux de difusion|
|**OG2**|Faciliter la prise de décision du fan via une recommandation intelligente|
|**OG3**|Préserver l’anonymat des utilisateurs tout en ofrant une vision communautaire|
|**OG4**|Fournir une base technique simple, extensible et démontrable en fn de stage|



## **4.2 Objectifs spécifiques** 

||Objectif spécifque|Mesure de succès|
|---|---|---|
|**OS1**|Permettre la consultation des matchs de<br>la Coupe du monde fltrés par équipe|Liste des matchs fonctionnelle, fltrage<br>opérationnel|
|**OS2**|Afcher les fan zones sur une carte inter-<br>active|Carte fonctionnelle avec au moins 3<br>fltres (distance, équipe, disponibilité)|
|**OS3**|Permettre un check-in anonyme en moins<br>de 2 clics|Fonctionnalité testée et validée|
|**OS4**|Fournir une recommandation IA avec ex-<br>plication textuelle|Module IA opérationnel avec réponse _<_<br>3 secondes|
|**OS5**|Générer<br>des<br>alertes<br>simples<br>liées<br>à<br>l’équipe favorite|Alerte<br>déclenchée<br>automatiquement<br>avant un match|



4 

# **5 Définition du périmètre** 

## **5.1 Dans le périmètre** 

|**Domaine**|Fonctionnalités incluses|
|---|---|
|**Authentifcation**|Inscription, connexion sécurisée (JWT, bcrypt)|
|**Utilisateurs**|Sélection d’équipe favorite, ville, préférence d’ambiance|
|**Matchs**|Consultation et fltrage des matchs|
|**Fan zones**|Carte, distance, capacité, disponibilité, équipes supportées|
|**Check-in**|Check-in anonyme, agrégation par équipe|
|**IA**|Recommandation, explication, suggestion d’alertes|
|**Alertes**|Alertes simples in-app|
|**Administration**|Gestion des matchs et fan zones, statistiques de base|



## **5.2 Hors périmètre** 

|**Élément exclu**|Justifcation|
|---|---|
|**Géolocalisation GPS en**<br>**temps réel**|Complexité technique trop élevée pour 1 mois|
|**Messagerie privée entre**<br>**utilisateurs**|Hors cœur de valeur du MVP|
|**Paiement et billetterie**|Hors périmètre fonctionnel|
|**Fonctionnalités**<br>**de**<br>**ré-**<br>**seau social avancées**|Non prioritaire pour la démonstration|
|**Intégration ofcielle à**<br>**l’APIFIFA**|Dépendance externe non maîtrisable|



# **6 Définition des acteurs et des parties prenantes** 

|**Acteur**|Interactions principales|
|---|---|
|**Utilisateur fnal**|Consultation des matchs, carte, check-in, alertes|
|**Administrateur**|Gestion des matchs, fan zones, statistiques|
|**Module IA**|Analyse des données et génération de recommandations|
|**Système d’alertes**|Envoi de notifcations in-app|



5 

# **7 Spécifications fonctionnelles** 

## **7.1 Exigences fonctionnelles** 

|**ID**|Exigence|Acteur<br>concerné|Priorité|Critère de vérifcation|
|---|---|---|---|---|
|**EF-01**|Le système doit permettre à un utili-<br>sateur de créer un compte via email et<br>mot de passe|Fan|Haute|Compte créé et persisté en base|
|**EF-02**|Le système doit permettre à un utilisa-<br>teur de s’authentifer de manière sécu-<br>risée (JWT)|Fan|Haute|Connexion réussie retourne un<br>token valide|
|**EF-03**|Le système doit permettre à l’utilisa-<br>teur de sélectionner une ou plusieurs<br>équipes favorites|Fan|Haute|Équipe(s) enregistrée(s) dans le<br>profl|
|**EF-04**|Le système doit permettre à l’utilisa-<br>teur de défnir sa ville/localisation|Fan|Moyenne|Ville enregistrée et utilisée pour<br>le calcul de distance|
|**EF-05**|Le système doit permettre à l’utilisa-<br>teur de choisir une préférence d’am-<br>biance (calme, familiale, animée, sup-<br>porters)|Fan|Moyenne|Préférence enregistrée et utilisée<br>par le module IA|
|**EF-06**|Le système doit afcher la liste des<br>matchs de la Coupe du monde|Fan|Haute|Liste des matchs afchée avec<br>équipes, date, heure, stade|
|**EF-07**|Le système doit permettre de fltrer les<br>matchs par équipe|Fan|Haute|Filtrage fonctionnel et résultats<br>cohérents|
|**EF-08**|Le système doit afcher les fan zones<br>sur une carte interactive|Fan|Haute|Carte Leafet afchant les points<br>géolocalisés|
|**EF-09**|Le système doit afcher, pour chaque<br>fan zone, la distance, la capacité, la dis-<br>ponibilité et les équipes difusées|Fan|Haute|Données visibles sur la fche de la<br>fan zone|
|**EF-10**|Le système doit permettre un check-in<br>anonyme dans une fan zone|Fan|Haute|Check-in enregistré sans exposi-<br>tion de l’identité|
|**EF-11**|Le système doit afcher une présence<br>agrégée et anonyme par équipe (ex. «<br>12 fans Tunisie ici »)|Fan|Haute|Agrégation correcte et anonymi-<br>sée|
|**EF-12**|Le système doit afcher le taux de rem-<br>plissage d’une fan zone (ex. « 70% plein<br>»)|Fan|Moyenne|Calcul<br>cohérent<br>avec<br>capa-<br>cité/places disponibles|
|**EF-13**|Le système doit recommander une fan<br>zone adaptée au profl de l’utilisateur|Module IA|Haute|Recommandation<br>générée<br>en<br>fonction de l’équipe, de la dis-<br>tance, de la disponibilité et de<br>l’ambiance|
|**EF-14**|Le système doit fournir une explication<br>textuelle de la recommandation|Module IA|Haute|Texte explicatif afché avec la re-<br>commandation|
|**EF-15**|Le système doit suggérer des alertes<br>pertinentes à l’utilisateur|Module IA|Moyenne|Suggestion afchée (ex. alerte 1h<br>avant match)|
|**EF-16**|Le<br>système<br>doit<br>permettre<br>l’activa-<br>tion d’une alerte pour un match d’une<br>équipe favorite|Fan|Moyenne|Alerte<br>créée<br>et<br>déclenchée<br>à<br>l’heure prévue|
|**EF-17**|Le système doit permettre à l’adminis-<br>trateur d’ajouter et modifer des matchs|Administrateur|Haute|Opérations CRUD fonctionnelles<br>sur les matchs|
|**EF-18**|Le système doit permettre à l’adminis-<br>trateur d’ajouter et modifer des fan<br>zones|Administrateur|Haute|Opérations CRUD fonctionnelles<br>sur les fan zones|
|**EF-19**|Le système doit permettre à l’adminis-<br>trateur de mettre à jour capacité, dispo-<br>nibilité, équipes supportées et horaires|Administrateur|Haute|Mise à jour refétée immédiate-<br>ment côté utilisateur|



6 

|**ID**|Exigence|Acteur<br>concerné|Priorité|Critère de vérifcation|
|---|---|---|---|---|
|**EF-20**|Le système doit permettre à l’adminis-<br>trateur de consulter des statistiques de<br>base sur les check-ins|Administrateur|Moyenne|Tableau de statistiques afché|
|**EF-21**|Le système peut générer automatique-<br>ment une courte description de fan zone<br>à partir des données admin|Module IA|Basse|Description générée et éditable<br>par l’admin|



## **7.2 Exigences non fonctionnelles** 

|**ID**|Catégorie (ISO 25010)|Exigence|Critère de vérifcation|
|---|---|---|---|
|**ENF-01**|Performance / Efcacité|Le temps de réponse de la recommandation<br>IA doit être inférieur à 3 secondes|Mesure sur environnement de<br>test|
|**ENF-02**|Performance / Efcacité|L’afchage de la carte des fan zones doit s’ef-<br>fectuer en moins de 2 secondes|Mesure sur environnement de<br>test|
|**ENF-03**|Sécurité|Les mots de passe doivent être stockés sous<br>forme hachée (bcrypt)|Vérifcation en base de données|
|**ENF-04**|Sécurité|L’accès aux fonctionnalités d’administration<br>doit être restreint par rôle|Test de contrôle d’accès (RBAC)|
|**ENF-05**|Confdentialité|Aucune donnée personnelle identifable ne<br>doit être afchée lors d’un check-in|Revue du modèle de données et<br>de l’afchage|
|**ENF-06**|Utilisabilité|L’interface doit être utilisable sur mobile et<br>desktop (responsive)|Test<br>sur<br>au<br>moins<br>2<br>tailles<br>d’écran|
|**ENF-07**|Fiabilité|Le système doit gérer les erreurs de saisie<br>sans interruption de service|Test de cas limites|
|**ENF-08**|Maintenabilité|Le code doit être structuré en modules<br>(Next.js / NestJS) selon une architecture<br>claire|Revue de code / architecture|
|**ENF-09**|Portabilité|L’application doit être déployable sur des<br>environnements<br>standards<br>(Vercel,<br>Ren-<br>der/Railway/VPS)|Déploiement testé avec succès|
|**ENF-10**|Compatibilité|Le système doit être compatible avec les<br>principaux navigateurs modernes|Test multi-navigateurs|
|**ENF-11**|Scalabilité<br>(préparation<br>future)|Le modèle de données doit permettre une<br>future extension géospatiale (PostGIS)|Revue du schéma PostgreSQL|



7 



<!-- Start of picture text -->
ee A -<br>=> mm Catena<br><!-- End of picture text -->



<!-- Start of picture text -->
Admin<br>World Cup FanZone Al - Admin<br>S'authentifier avec contréle de réle<br>«include» «include» «include» «include» «include»<br>Ajouter un match Modifier un match Modifier une fan zone Consulter les statistiques de check-ins<br>\//a<br>\is ‘ s .<br>‘\ii ‘ i/ ‘ «extend» ~ \\<br>\‘ U \<br>\‘'\<br>\U ! \<br>\ \ «include» / «include» \ «include» (Mettre a jour capacité/dispo/équipes/horaires Ul‘«include»<br>\/\’<br>\/ \ /<br>\ f ‘ \ s. “ ¢<br>\ ‘ Sy U<br>V+ x. -<br>t sey t £<br>Gestion des matchs Gestion des fan zones<br><!-- End of picture text -->



<!-- Start of picture text -->
1 i<br>Module IA Systeme d'alertes<br>«include»<br>extend» «extend»<br><!-- End of picture text -->



<!-- Start of picture text -->
(© AuthController<br>[eT<br>o register(dto: RegisterDTO): AuthResponse<br>o login(dto: LoginDTO): AuthResponse<br>orefreshToken(token: string): AuthResponse<br>appelle<br>© AuthService<br>ouserService: UserService<br>otokenProvider: TokenProvider © RoleGuard<br>o validubaCredontiols . 5 ee<br>o validateCredentials(email: eral sive, string, parca password: string): boolean otanActivate(request: Request}: boolean<br>o generateJWT(userld: string, role: string): string<br>o verifyRole(token: string): Role<br>utilise utilise génere vérifie<br>© UserAccount<br>: ; © TokenProvider<br>aid: string<br>oemail: string osecretKey: string<br>uo passwordHash: string oexpiration: number USER<br>no role: Role osign(payload: object): string |ADMIN |<br>cisAdmin()}: boolean overify(token: string): object<br>o matchPassword(plainPassword: string): boolean<br><!-- End of picture text -->



<!-- Start of picture text -->
© UserControlier (E)AtmospherePreference<br>a CALM<br>o getProfile(userld: string): User FAMILY_FRIENDLY<br>o updateProfile(userld: string, dto: UpdateProfileDTO): User CROWDED<br>o setFavoriteTeams(userld: string, teamlds: string[]): User SUPPORTERS<br>a<br>appelle<br>a<br>oupdateCity(userld: string, city: string): void<br>o updateAtmospherePreference(userld: string, pref: AtmospherePreference): void<br>o addFavoriteTeam(userld: string, teamld: string): void<br>o removeFavoriteTeam(userld: string, teamld: string): void<br>gere<br>oid: string<br>oname: string<br>cemail: string<br>acity: string<br>oatmospherePreference: AtmospherePreference<br>o getFavoriteTeams(): FavoriteTeam[]<br>1.<br>(© FavoriteTeam<br>ouserld: string<br>oteamid: string<br>[<br>reférence (partagée)<br>oid: string<br>oname: string<br>ocode: string<br>a|<br><!-- End of picture text -->



<!-- Start of picture text -->
Match Service<br>(© MatchController<br>CO<br>o listMatches(}: Match[]<br>o filterByTeam(teamld: string): Match[]<br>o createMatch(dto: CreateMatchDTO): Match (admin)<br>o updateMatch(id: string, dto: UpdateMatchDTO): Match (admin)<br>appelle<br>© MatchService<br>OT<br>ogetUpcomingMatches(): Match[]<br>ofilterByTeam(teamld: string): Match{]<br>ovalidateAdminAccess(userld: string): boolean<br>ocreateMatch(dto: CreateMatchDTO): Match<br>oupdateMatch(id: string, dto: UpdateMatchDTO): Match<br>gere<br>© Match<br>oid: string<br>oteamaAld: string<br>oteamBld: string<br>omatchDate: datetime<br>omatchTime: time<br>ostage: string<br>ostadium: string<br>oisUpcoming(): boolean<br>oinvolvesTeam(teamld: string): boolean<br>référence (partagée)<br>oid: string<br>oname: string<br>ocode: string<br>ee|<br><!-- End of picture text -->



<!-- Start of picture text -->
FanZone Service<br>© FanZoneController<br>a<br>olistFanZones(): FanZone[]<br>o getFanZoneDetails(id: string): FanZone<br>o createFanZone(dto: CreateFanZoneDTO): FanZone (admin)<br>o updateFanZone(id: string, dto: UpdateFanZoneDTO): FanZone (admin)<br>appelle<br>© FanZoneService<br>|<br>ogetNearbyFanZones(userLocation: Location): FanZone[]<br>o getFanZoneDetails(id: string): FanZone<br>o updateCapacity(id: string, capacity: number): void<br>o updateSupportedTeams(id: string, teamids: string[]): void<br>gére<br>id: string<br>oname: string<br>oaddress: string<br>olatitude: float<br>olongitude: float<br>otype: string<br>ocapacity: number<br>oavailableSeats: number<br>o getDistanceFrom(location: Location): float<br>ogetOccupancyRate(): float<br>0..* 0..*<br>©SupportedTeam ©cheduledMatch<br>ofanZoneld: string ofanZoneld: string<br>oteamild: string omatchid: string<br>a a|<br>référence (partagée) référence (partagée)<br>id: string © Motch<br>oname: string | cid: string |<br>ocode: string Co<br>Co<br><!-- End of picture text -->



<!-- Start of picture text -->
Checkin Service<br>© CheckInController<br>Td<br>o checkin(dto: CheckInDTO): CheckIlnResponse<br>o getAnonymousPresence(fanZoneld: string): PresenceAggregate[]<br>o getOccupancyRate(fanZoneld: string): float<br>appelle<br>(© CheckinService<br>OT<br>o createChecklin(dto: CheckInDTQO): Checkin<br>oc anonymizeUser(checkin: Checkin): void<br>o aggregatePresenceByTeam(fanZoneld: string): PresenceAggregate[]<br>o computeOccupancyRate(fanZoneld: string): float<br>gere génere<br>(© Checkin<br>oid: string (©)PresenceAggregate<br>ofanZoneld: string a<br>o teamSupportedid: string eae suing<br>oisAnonymous: boolean = true a fanCount: inte er<br>ocreatedAt: datetime 9<br>o anonymize(): void<br>reference reférence represente<br>name:<br>gid: string oname: =string<br>|<br><!-- End of picture text -->



<!-- Start of picture text -->
Al Recommendation Service<br>© RecommendationController<br>a|<br>ogetRecommendation(userld: string): Recommendation<br>o generateFanZoneDescription(fanZoneld: string): string (admin)<br>appelle<br>© RecommendationService<br>ouserService: UserService<br>a matchService: MatchService<br>ou fanZoneService: FanZoneService © FanZoneDescriptionGenerator—<br>acheckinService:oaiProvider: AlProviderCheckinService 5 aiProvider:- AlProvider<br>© computeScore(fanZone: FanZone, criteria: RecommendationCriteria): float ogenerateDescription(fanZonelnputs: object): string<br>orankFanZones(criteria: RecommendationCriteria): FanZone[]<br>o buildExplanation(fanZone: FanZone, scores: Map): string<br>o suggestAlert(user: User, fanZone: FanZone): AlertSuggestion<br>produit lutilise génre tilise utilise<br>© AlertSuggestion © RecommendationCriteria © Recommendation<br>oteamid:ofanZoneld:stringstring oes.  Dleran once: haazone. eterence cascore:cexplanationText:float string |ogenerateText(prompt: string): string<br>uosuggestedTime: datetime apresenceData: PresenceAggregate|] a suggestedAlert: AlertSuggestion - cw A<br>St ———F a “7 - '<br>-7 '<br>-7 “ -7 ''<br>© OpenA|Provider © LocalAlProvider<br>es |<br>ogenerateText(prompt: string): string ogenerateText(prompt: string): string<br><!-- End of picture text -->



<!-- Start of picture text -->
Alert Service<br>© AlertController<br>PO<br>o createAlert(dto: CreateAlertDTO): Alert<br>o activateAlert(id: string): Alert<br>o deactivateAlert(id: string): Alert<br>o listUserAlerts(userld: string): Alert]<br>appelle<br>© AlertService<br>|<br>oscheduleAlert(alert: Alert): void<br>ocheckTriggerConditions(): void<br>onotifyUser(userld: string, message: string): void<br>utilise genére<br>(© AlertScheduler (© NotificationPayload=<br>PT ouserld: string<br>orunScheduledCheck(): void otimestamp: datetime<br>Po<br>déclenche<br>© Alert<br>oid: string<br>ouserld: string<br>otype: string<br>oteamid: string<br>ofanZoneld: string<br>oisActive: boolean<br>otrigger(): void<br>oactivate(): void<br>odeactivate(): void<br><!-- End of picture text -->



<!-- Start of picture text -->
Admin Statistics Service<br>(© StatisticsController<br>LT<br>o getCheckinStatistics(filters: StatisticsFilters): StatisticsReport (admin)<br>appelle<br>(© StatisticsService<br>ocheckinService: CheckinService<br>o aggregateCheckinsByFanZone(): Map<string, integer><br>09 aggregateCheckinsByTeam(): Map<string, integer><br>o aggregateCheckiInsByPeriod(startDate: datetime, endDate: datetime): Map<datetime, integer><br>accepte genere<br>(© StatisticsFilters (© StatisticsReport<br>o StartDate: datetime ototalCheckins: integer<br>oendDate: datetime obyFanZone: Map<string, integer><br>o fanZoneld: string obyTeam: Map<string, integer><br>oteamld: string obyPeriod: Map<datetime, integer><br>[<br><!-- End of picture text -->



<!-- Start of picture text -->
@®user_favorite_teams<br>ouser_id : UUID [FK]<br>oteam_id : UUID [FK]<br>6 created_at : TIMESTAMP<br>oid : UUID [PK]<br>od user_id : UUID [FK, NULLABLE]<br>‘| fan_zone_id : UUID [FK]<br>team_supported_id : UUID [FK]<br>. 04 is_anonymous : BOOLEAN (default: true)<br>oid : UUID [PK] oid : UUID [PK] °<br>emailemail :: VARCHAR(255)VARCHAR(255) [UNIQUE] | codecode:: VARCHAR(10)VARCHAR(10) od[© fan_zone_supported_teams| © fan_zone_supported_teams<br>password_hash : VARCHAR(255) . % o fan_zone_id : UUID [FK]<br>city : VARCHAR(255) oteam_id : UUID [FK]<br>parting ttIh achat ein: IM (calI m e,e, famifami lial e,e, animée,animée, supporters) " created_at : TIMESTAMP<br>created_at : TIMESTAMP oid : UUID [PK] °<br>Ta \@)<br>og name:address VARCHARSS): TEXT | ©© atsalerts<br>latitude : DECIMAL(10,8) oid : UUID [PK]<br>oid : UUID [PK] Lo longitudeSeay : DECIMAL(11,8(11,8) Od user_id : UUID [FK]<br>type : VARCHAR(100) zl<br>team_a_id : UUID [FK] capacity<br>team b id: UUID [FK] ?° available_seats: INTEGER: INTEGER ghtteam_id : UUIDShahar[FK, NULLABLE]<br>match_date : DATE created_by : UUID [FK] fan_zone_id : UUID [FK, NULLABLE]<br>match_time : TIME created at: TIMESTAMP > is_active : BOOLEAN (default: true)<br>stage : VARCHAR(100) oA created_at : TIMESTAMP<br>stadium : VARCHAR(255)<br>created_at : TIMESTAMP |’<br>(©) ai_recommendations_log<br>oid : UUID [PK]<br>user_id : UUID [FK]<br>og fan_zone_id : UUID [FK]<br>score : DECIMAL(5,2)<br>explanation_text : TEXT<br>created_at: TIMESTAMP<br>Og (© fan_zone_matches<br>o fan_zone_id : UUID [FK]<br>© match_id : UUID [FK]<br>created_at : TIMESTAMP<br><!-- End of picture text -->

