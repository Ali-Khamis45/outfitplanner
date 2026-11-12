import unittest
import numpy as np
import trimesh
from check import exact_collisions

class CollisionTests(unittest.TestCase):
    def setUp(self):
        self.body = trimesh.creation.box(extents=[2, 2, 2])

    def test_inside_outside_and_depth(self):
        inside, depth, _ = exact_collisions(self.body, np.array([[0., 0., 0.], [2., 0., 0.]]))
        self.assertEqual(inside.tolist(), [True, False])
        self.assertAlmostEqual(depth[0], 1.)
        self.assertEqual(depth[1], 0.)

    def test_shifted_garment(self):
        garment = np.array([[1.1, 0.1, 0.1], [1.1, -0.1, 0.1], [1.1, 0., -0.1]])
        self.assertFalse(exact_collisions(self.body, garment)[0].any())
        inside, depth, _ = exact_collisions(self.body, garment + [-0.2, 0, 0])
        self.assertTrue(inside.all())
        np.testing.assert_allclose(depth, 0.1, atol=1e-7)

    def test_shallow_inward_shifts_and_single_vertex(self):
        garment = np.array([[1., -0.1, -0.1], [1., 0.1, -0.1], [1., 0., 0.1]])
        for shift in (0.002, 0.005):
            with self.subTest(shift=shift):
                moved = garment + [-shift, 0., 0.]
                inside, depth, _ = exact_collisions(self.body, moved)
                self.assertTrue(inside.all())
                np.testing.assert_allclose(depth, shift, atol=1e-7)
        garment[1, 0] -= 0.003
        inside, depth, _ = exact_collisions(self.body, garment)
        self.assertEqual(inside.tolist(), [False, True, False])
        self.assertAlmostEqual(depth[1], 0.003, places=7)

if __name__ == '__main__':
    unittest.main()
