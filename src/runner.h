#ifndef _FUS_RUNNER_H_
#define _FUS_RUNNER_H_


/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


#define FUS_RUNNER_SUPER_HACKY_DEBUG_INFO 0




typedef enum fus_runner_callframe_type {
    FUS_CALLFRAME_TYPE_MODULE,
    FUS_CALLFRAME_TYPE_DEF,
    FUS_CALLFRAME_TYPE_PAREN,
    FUS_CALLFRAME_TYPE_IF,
    FUS_CALLFRAME_TYPE_DO,
    FUS_CALLFRAME_TYPE_INT_FOR,
    FUS_CALLFRAME_TYPE_ARR_FOR,
    FUS_CALLFRAME_TYPES
} fus_runner_callframe_type_t;


struct fus_runner_callframe {
    fus_runner_t *runner; /* parent */

    fus_runner_callframe_type_t type;
    bool inherits;
    fus_boxed_t *fun_boxed;
    fus_arr_t *data;
    int i;

    union {
        struct {
            int i;
            int n;
        } int_for;
        struct {
            int i;
            fus_boxed_t *boxed;
        } arr_for;
    } loop_data;

    fus_arr_t stack;
    fus_obj_t vars;
};

struct fus_runner {
    fus_vm_t *vm;

    fus_obj_t defs;
    fus_array_t callframes;

#if FUS_USE_SETJMP
    jmp_buf error_jmp_buf;
#endif

    fus_class_t class_callframe;
};


/*********
 * STATE *
 *********/

void fus_runner_dump_error(fus_runner_t *runner);
void fus_runner_dump_state(fus_runner_t *runner, FILE *file, const char *fmt);

int fus_runner_exec_lexer(fus_runner_t *runner, fus_lexer_t *lexer,
    bool dump_parser);
int fus_runner_exec_data(fus_runner_t *runner, fus_arr_t *data);
int fus_runner_exec_defs(fus_runner_t *runner);
int _fus_runner_exec_defs(fus_runner_t *runner, fus_arr_t *data);
int fus_runner_exec(fus_runner_t *runner);


/********************
 * RUNNER CALLFRAME *
 ********************/

void fus_runner_callframe_init(fus_runner_callframe_t *callframe,
    fus_runner_t *runner, fus_runner_callframe_type_t type,
    fus_arr_t *data);
void fus_runner_callframe_cleanup(fus_runner_callframe_t *callframe);
bool fus_runner_callframe_type_inherits(fus_runner_callframe_type_t type);
bool fus_runner_callframe_type_is_do_like(fus_runner_callframe_type_t type);


/**********
 * RUNNER *
 **********/

void fus_runner_init(fus_runner_t *runner, fus_vm_t *vm);
void fus_runner_cleanup(fus_runner_t *runner);
void fus_runner_reset(fus_runner_t *runner);
int fus_runner_load(fus_runner_t *runner, fus_arr_t *data);
int fus_runner_rewind(fus_runner_t *runner);
void fus_runner_dump_callframes(fus_runner_t *runner, FILE *file,
    bool end_at_here);

void fus_vm_error_callback_runner_setjmp(fus_vm_t *vm, fus_err_code_t code);

fus_runner_callframe_t *fus_runner_get_root_callframe(fus_runner_t *runner);
fus_runner_callframe_t *fus_runner_get_callframe(fus_runner_t *runner);
fus_runner_callframe_t *fus_runner_get_data_callframe(
    fus_runner_t *runner, bool old);
fus_arr_t *fus_runner_get_stack(fus_runner_t *runner);
fus_obj_t *fus_runner_get_vars(fus_runner_t *runner);
bool fus_runner_is_done(fus_runner_t *runner);
fus_runner_callframe_t *fus_runner_push_callframe(fus_runner_t *runner,
    fus_runner_callframe_type_t type, fus_arr_t *data);
fus_runner_callframe_t *fus_runner_push_callframe_fun(fus_runner_t *runner,
    fus_runner_callframe_type_t type, fus_boxed_t *f_boxed);
void fus_runner_pop_callframe(fus_runner_t *runner);
void fus_runner_start_callframe(fus_runner_t *runner,
    fus_runner_callframe_t *callframe);
void fus_runner_end_callframe(fus_runner_t *runner);
int fus_runner_break_or_loop(fus_runner_t *runner, const char *token, char c);


/***************
 * RUNNER STEP *
 ***************/

int fus_runner_step(fus_runner_t *runner);



/*******************
 * FUS_CLASS STUFF *
 *******************/

void fus_class_cleanup_runner_callframe(fus_class_t *class, void *ptr);


#endif