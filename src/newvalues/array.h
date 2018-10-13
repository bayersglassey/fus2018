#ifndef _FUS_ARRAY_H_
#define _FUS_ARRAY_H_

/* fus_array_t builds on fus_class_t, implementing basic arrays of
    class instances. */


#include "core.h"
#include "class.h"



typedef struct fus_array {
    fus_class_t *class;
    void *elems;
    int len;
    size_t size;
} fus_array_t;



void fus_array_init(fus_array_t *array, fus_class_t *class);
void fus_array_cleanup(fus_array_t *array);


#endif