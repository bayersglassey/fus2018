
#include <Python.h>

#include "../includes.h"

typedef struct module_state {
    fus_t fus;
} module_state_t;


PyDoc_STRVAR(module_doc,
    "Python wrapper for the \"fus\" programming language.");

static int module_exec(PyObject *module){
    module_state_t *state = PyModule_GetState(module);
    fus_t *fus = &state->fus;

    fus_init(fus);
    /* Where do we call fus_cleanup?..
    There is PyModuleDef.m_free, but the docs say:
        "This function may be called before module state is allocated
        (PyModule_GetState() may return NULL), and before the Py_mod_exec
        function is executed."
        - https://docs.python.org/3/c-api/module.html#c.PyModuleDef.m_free
    ...the "before Py_mod_exec" behaviour seems dumb.
    The docs knew we would want to know about this behaviour, but didn't
    bother explaining its rationale. >:( */

    return 0;
}

static PyObject *module_method_run(PyObject *self, PyObject *args){
    const char *text;
    if(!PyArg_ParseTuple(args, "s:run", &text))return NULL;

    module_state_t *state = PyModule_GetState(self);
    fus_t *fus = &state->fus;
    if(fus_run_text(fus, text, NULL) < 0){
        PyErr_SetString(PyExc_RuntimeError, "Fus runtime");
        return NULL;
    }

    Py_INCREF(Py_None);
    return Py_None;
}

static PyMethodDef module_methods[] = {
    {"run", module_method_run, METH_VARARGS,
        PyDoc_STR("Executes arbitrary fus code, passed as a str.")},
    {NULL, NULL}
};

static struct PyModuleDef_Slot module_slots[] = {
    {Py_mod_exec, module_exec},
    {0, NULL},
};

static struct PyModuleDef module_def = {
    PyModuleDef_HEAD_INIT,
    "fus",
    module_doc,
    sizeof(module_state_t),
    module_methods,
    module_slots,
    NULL,
    NULL,
    NULL
};


PyMODINIT_FUNC PyInit_fus(void){
    return PyModuleDef_Init(&module_def);
}
