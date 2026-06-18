import React, { useState, useEffect, Suspense, useRef } from 'react'
import { Canvas, useLoader, useFrame, useThree } from '@react-three/fiber'
import { Text, ScrollControls, useScroll, useProgress, OrbitControls, Preload, Stars } from '@react-three/drei'
import * as THREE from 'three'

interface Game {
  id: string
  name: string
  coverImage?: string
  imageUrl?: string
}

class ErrorBoundary extends React.Component<{ fallback: React.ReactNode, children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError(error: any) {
    return { hasError: true }
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error('ErrorBoundary caught error:', error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

function SceneReadyListener({ setSceneReady }: { setSceneReady: (ready: boolean) => void }) {
  useEffect(() => {
    let f1: number
    let f2: number
    // Wait two frames to ensure WebGL has compiled shaders and uploaded textures to GPU
    f1 = requestAnimationFrame(() => {
      f2 = requestAnimationFrame(() => {
        setSceneReady(true)
      })
    })
    return () => {
      cancelAnimationFrame(f1)
      cancelAnimationFrame(f2)
    }
  }, [setSceneReady])
  return null
}

function LoadingScreen({ sceneReady }: { sceneReady: boolean }) {
  const { loaded, total } = useProgress()
  const [show, setShow] = useState(true)
  const [minTimePassed, setMinTimePassed] = useState(false)

  // Force the load screen to stay up for at least 2 seconds so Preload can compile shaders
  // without the user experiencing any stutter.
  useEffect(() => {
    const t = setTimeout(() => setMinTimePassed(true), 2000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    // Keep showing the loading screen until the network is done loading (loaded === total)
    // AND the React Suspense has committed and painted the scene to the GPU (sceneReady)
    if (minTimePassed && total > 0 && loaded === total && sceneReady) {
      setShow(false)
    }
  }, [loaded, total, minTimePassed, sceneReady])

  if (!show) return null

  return (
    <div style={{
      position: 'absolute', 
      top: 0, 
      left: 0, 
      width: '100vw', 
      height: '100vh',
      display: 'flex', 
      flexDirection: 'column', 
      justifyContent: 'center', 
      alignItems: 'center',
      background: '#050505', 
      color: 'white', 
      zIndex: 1000, 
      fontFamily: "'Rajdhani', sans-serif"
    }}>
      <h2 style={{ marginBottom: '10px', fontWeight: 600, letterSpacing: '1px' }}>Loading...</h2>
      <p style={{ margin: 0, fontSize: '1.2rem', fontWeight: 500 }}>{loaded} / {total || '...'} games loaded</p>
    </div>
  )
}

function GameMaterial({ url }: { url: string }) {
  const texture = useLoader(THREE.TextureLoader, url)
  // Ensure the texture is ready
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  return <meshStandardMaterial map={texture} roughness={0.8} metalness={0.1} />
}

function GameCase({ game, position, shelfScale }: { game: Game; position: [number, number, number]; shelfScale: number }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  
  useFrame((state, delta) => {
    if (meshRef.current) {
      if (hovered) {
        // Just pop straight out of the shelf a little bit
        const targetZ = position[2] + 0.4
        meshRef.current.position.lerp(new THREE.Vector3(position[0], position[1], targetZ), 12 * delta)
        meshRef.current.scale.setScalar(THREE.MathUtils.lerp(meshRef.current.scale.x, 1.15, 12 * delta))
        
        // Ensure rotation stays flat
        meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, 12 * delta)
        meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, 0, 12 * delta)
      } else {
        // Return to original local position
        meshRef.current.position.lerp(new THREE.Vector3(...position), 10 * delta)
        meshRef.current.scale.setScalar(THREE.MathUtils.lerp(meshRef.current.scale.x, 1, 10 * delta))
        
        // Return to flat rotation
        meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, 10 * delta)
        meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, 0, 10 * delta)
      }
    }
  })

  const fallbackMaterial = (
    <>
      <meshStandardMaterial color="#2a2a2a" roughness={0.8} metalness={0.1} />
      <Text 
        position={[0, 0, 0.051]} 
        fontSize={0.12}  
        maxWidth={0.9} 
        textAlign="center" 
        color="white" 
        anchorY="middle"
      >
        {game.name}
      </Text>
    </>
  )

  return (
    <mesh 
      ref={meshRef}
      position={position} 
      onClick={() => window.api.launchGame(game.id)}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
      onPointerOut={(e) => { setHovered(false) }}
      frustumCulled={false} // Disable culling so we don't get lag spikes when scrolling
    >
      <boxGeometry args={[1, 1.4, 0.1]} />
      {game.imageUrl ? (
        <ErrorBoundary fallback={fallbackMaterial}>
          <GameMaterial url={game.imageUrl} />
        </ErrorBoundary>
      ) : fallbackMaterial}
    </mesh>
  )
}

function Shelf({ width, height, depth, rows }: { width: number; height: number; depth: number; rows: number }) {
  const thickness = 0.1
  const innerShelves = []
  
  const shelfSpacing = height / rows
  for (let i = 1; i < rows; i++) {
    innerShelves.push(
      <mesh key={i} position={[0, -i * shelfSpacing, 0]} frustumCulled={false}>
        <boxGeometry args={[width, thickness, depth]} />
        <meshStandardMaterial color="#4d3b2f" />
      </mesh>
    )
  }

  return (
    <group>
      {/* Bottom shelf */}
      <mesh position={[0, -height, 0]} frustumCulled={false}>
        <boxGeometry args={[width, thickness, depth]} />
        <meshStandardMaterial color="#4d3b2f" />
      </mesh>
      {/* Top shelf */}
      <mesh position={[0, 0, 0]} frustumCulled={false}>
        <boxGeometry args={[width, thickness, depth]} />
        <meshStandardMaterial color="#4d3b2f" />
      </mesh>
      {/* Left side */}
      <mesh position={[-width / 2, -height / 2, 0]} frustumCulled={false}>
        <boxGeometry args={[thickness, height, depth]} />
        <meshStandardMaterial color="#4d3b2f" />
      </mesh>
      {/* Right side */}
      <mesh position={[width / 2, -height / 2, 0]} frustumCulled={false}>
        <boxGeometry args={[thickness, height, depth]} />
        <meshStandardMaterial color="#4d3b2f" />
      </mesh>
      {/* Inner shelves */}
      {innerShelves}
    </group>
  )
}

function ScrollableShelf({ games, rows, cols, shelfWidth, shelfHeight, maxScroll, spacingX, scale }: any) {
  const scroll = useScroll()
  const { viewport } = useThree()
  const groupRef = useRef<THREE.Group>(null)

  useFrame(() => {
    if (groupRef.current) {
      // The camera targets Y=3. So the center of the viewport is Y=3.
      // Top of the viewport is 3 + viewport.height / 2.
      // We subtract padding to account for perspective tilt and leave a nice top margin
      const topPadding = 1.8
      const topY = 3 + viewport.height / 2 - topPadding
      groupRef.current.position.y = topY + scroll.offset * maxScroll
    }
  })

  // Start X to left-align the games within the shelf
  const gamesWidth = cols * spacingX
  const startX = -gamesWidth / 2 + spacingX / 2

  return (
    <group ref={groupRef} scale={scale}>
      <Shelf width={shelfWidth} height={shelfHeight} depth={1} rows={rows} />
      <group position={[startX, 0, 0.4]}>
        {games.map((game: Game, index: number) => {
          const row = Math.floor(index / cols)
          const col = index % cols
          return (
            <GameCase
              key={game.id}
              game={game}
              position={[col * spacingX, -0.9 - row * 1.8, 0]}
              shelfScale={scale}
            />
          )
        })}
      </group>
    </group>
  )
}

function ShelfContainer({ games }: { games: Game[] }) {
  const { viewport } = useThree()
  
  const cols = 8 // Fixed to exactly 8 games per row
  const spacingX = 1.3 // Standard tight visual spacing
  const gamesWidth = cols * spacingX
  const baseShelfWidth = gamesWidth + 0.4
  
  // Scale the entire shelf assembly so it spans 85% of the viewport width
  const scale = (viewport.width * 0.85) / baseShelfWidth
  
  const rows = Math.max(1, Math.ceil(games.length / cols))
  const baseShelfHeight = rows * 1.8 + 0.2
  const scaledShelfHeight = baseShelfHeight * scale
  
  // Add 4 units of padding to maxScroll to account for the top margin and leave room at the bottom
  const maxScroll = Math.max(0, scaledShelfHeight - viewport.height + 4)
  const pages = 1 + maxScroll / viewport.height

  return (
    <ScrollControls pages={pages} damping={0.1}>
      <ScrollableShelf 
        games={games} 
        rows={rows} 
        cols={cols} 
        shelfWidth={baseShelfWidth} 
        shelfHeight={baseShelfHeight} 
        maxScroll={maxScroll} 
        spacingX={spacingX}
        scale={scale}
      />
    </ScrollControls>
  )
}

function App(): JSX.Element {
  const [games, setGames] = useState<Game[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [sceneReady, setSceneReady] = useState(false)

  useEffect(() => {
    window.api.getGames().then((loadedGames) => {
      setGames(loadedGames)
      setLoading(false)
    })
  }, [])

  const filteredGames = games.filter(game => 
    game.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#050505', position: 'relative' }}>
      <LoadingScreen sceneReady={sceneReady} />
      
      {!loading && (
        <div style={{
          position: 'absolute',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100
        }}>
          <input 
            type="text" 
            placeholder="Search games..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              padding: '12px 24px',
              fontSize: '18px',
              fontWeight: 600,
              letterSpacing: '1px',
              borderRadius: '24px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(0, 0, 0, 0.5)',
              color: 'white',
              width: '300px',
              backdropFilter: 'blur(10px)',
              outline: 'none',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
              transition: 'border-color 0.2s, box-shadow 0.2s'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'rgba(255, 204, 153, 0.6)'
              e.target.style.boxShadow = '0 4px 16px rgba(255, 204, 153, 0.3)'
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)'
              e.target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.5)'
            }}
          />
        </div>
      )}

      {/* Moved camera back to Z=16 to ensure everything fits better on screen */}
      <Canvas camera={{ position: [0, 5, 16], fov: 50 }}>
        <color attach="background" args={['#000005']} />
        <ambientLight intensity={1} />
        <spotLight position={[0, 15, 10]} angle={1.2} penumbra={1} intensity={1200} castShadow color="#ffcc99" />
        <pointLight position={[-5, 5, 5]} intensity={300} color="#ff9966" />
        
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        
        <OrbitControls  
          target={[0, 3, 0]} 
          enablePan={false} 
          enableRotate={false} 
          enableZoom={false} 
        />

        {!loading && (
          <Suspense fallback={null}>
            <group>
              <ShelfContainer games={filteredGames} />
              <SceneReadyListener setSceneReady={setSceneReady} />
              <Preload all />
            </group>
          </Suspense>
        )}
      </Canvas>
    </div>
  )
}

export default App
